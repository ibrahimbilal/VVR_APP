using System.Diagnostics;
using System.Diagnostics.CodeAnalysis;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

const string MutexName = "Global\\RIBO_VideosFactory_StartDevServer";
const string PackageName = "ribo-studio";
const string AiModelName = "upscayl-lite-4x";
const string AiExeName = "realesrgan-ncnn-vulkan.exe";
/** Dev UI (Vite); API is 3001 — do not open the API URL in the browser. */
const string ViteDevUrl = "http://127.0.0.1:5173/";

using var mutex = new Mutex(true, MutexName, out var ownsMutex);
if (!ownsMutex)
{
    Console.Error.WriteLine("[Video factory] Another launcher is already running.");
    Console.Error.WriteLine("Close the other window or stop its dev server before starting again.");
    PauseBeforeExit(1);
}

var processPath = Environment.ProcessPath ?? "";
if (!string.Equals(Path.GetExtension(processPath), ".exe", StringComparison.OrdinalIgnoreCase))
{
    Console.Error.WriteLine(
        "[Video factory] Warning: This file should use a .exe extension (e.g. Video factory.exe). "
            + "Without it Windows may not run or trust the app correctly. Path: "
            + (string.IsNullOrEmpty(processPath) ? "(unknown)" : processPath));
}

var exeDir = Path.GetDirectoryName(Environment.ProcessPath) ?? Environment.CurrentDirectory;
var projectRoot = FindProjectRoot(exeDir);
if (projectRoot is null)
{
    Fail(
        "Could not find the project folder (package.json with name \"ribo-studio\").\n" +
            "Place Video factory.exe in the repo root (or a subfolder) and run npm install once.");
}

if (!Directory.Exists(Path.Combine(projectRoot, "node_modules")))
{
    Fail($"Dependencies are missing in:\n  {projectRoot}\n\nRun once from that folder:\n  npm install");
}

if (!CommandExists("npm"))
{
    Fail("npm was not found on PATH.\nInstall Node.js (includes npm) and reopen this window.");
}

if (!CommandExists("node"))
{
    Fail("node was not found on PATH.\nInstall Node.js and reopen this window.");
}

Console.WriteLine("[Video factory] Project: " + projectRoot);
Console.WriteLine("[Video factory] Running npm run dev …");
Console.WriteLine("[Video factory] Close this window to stop the dev server.\n");

ApplyRepoDotenvToProcess(projectRoot);

MaybeRunAiLiteSetup(projectRoot);

using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(4) };
using var cts = new CancellationTokenSource();
var browserOpened = 0;
Process? devProcess = null;

Console.CancelKeyPress += (_, e) =>
{
    e.Cancel = true;
    cts.Cancel();
};

AppDomain.CurrentDomain.ProcessExit += (_, _) =>
{
    if (devProcess is not null) TryKillTree(devProcess);
};

var psi = new ProcessStartInfo
{
    FileName = "cmd.exe",
    Arguments = "/d /s /c npm run dev",
    WorkingDirectory = projectRoot,
    UseShellExecute = false,
    RedirectStandardOutput = true,
    RedirectStandardError = true,
    StandardOutputEncoding = Encoding.UTF8,
    StandardErrorEncoding = Encoding.UTF8,
};

if (TryApplyAiLiteEnv(projectRoot, psi, out var aiNote))
{
    Console.WriteLine("[Video factory] " + aiNote);
}

devProcess = new Process { StartInfo = psi, EnableRaisingEvents = true };
devProcess.OutputDataReceived += (_, e) => ForwardLine(e.Data, isError: false);
devProcess.ErrorDataReceived += (_, e) => ForwardLine(e.Data, isError: true);

if (!devProcess.Start())
{
    Fail("Could not start npm run dev.");
}

devProcess.BeginOutputReadLine();
devProcess.BeginErrorReadLine();

_ = TryOpenBrowserWhenReady(ViteDevUrl);

try
{
    await devProcess.WaitForExitAsync(cts.Token);
}
catch (OperationCanceledException)
{
    Console.WriteLine("\n[Video factory] Stopping dev server …");
    TryKillTree(devProcess);
    devProcess.WaitForExit(5000);
    return 0;
}

return devProcess.ExitCode;

void ForwardLine(string? line, bool isError)
{
    if (line is null) return;
    if (isError) Console.Error.WriteLine(line);
    else Console.WriteLine(line);
}

async Task TryOpenBrowserWhenReady(string url)
{
    if (Interlocked.CompareExchange(ref browserOpened, 1, 0) != 0) return;

    try
    {
        var deadline = DateTime.UtcNow.AddMinutes(2);
        while (DateTime.UtcNow < deadline && !cts.IsCancellationRequested)
        {
            try
            {
                using var response = await http.GetAsync(url, cts.Token);
                if ((int)response.StatusCode is >= 200 and < 500)
                {
                    Console.WriteLine("\n[Video factory] Opening " + url);
                    OpenBrowser(url);
                    return;
                }
            }
            catch
            {
                // server still starting
            }

            await Task.Delay(500, cts.Token);
        }

        if (!cts.IsCancellationRequested)
            Console.WriteLine("\n[Video factory] Server did not respond in time. Open manually: " + url);
    }
    catch (OperationCanceledException)
    {
        // shutting down
    }
}

static string? FindProjectRoot(string startDir)
{
    var dir = Path.GetFullPath(startDir);
    var root = Path.GetPathRoot(dir);
    while (!string.IsNullOrEmpty(dir) && dir != root)
    {
        var pkgPath = Path.Combine(dir, "package.json");
        if (File.Exists(pkgPath))
        {
            try
            {
                using var doc = JsonDocument.Parse(File.ReadAllText(pkgPath));
                if (doc.RootElement.TryGetProperty("name", out var name) && name.GetString() == PackageName)
                    return dir;
            }
            catch
            {
                // ignore invalid package.json
            }
        }

        dir = Path.GetDirectoryName(dir)!;
    }

    return null;
}

static bool CommandExists(string command)
{
    try
    {
        using var which = Process.Start(
            new ProcessStartInfo("cmd.exe", $"/d /s /c where {command}")
            {
                RedirectStandardOutput = true,
                UseShellExecute = false,
                CreateNoWindow = true,
            });
        if (which is null) return false;
        var output = which.StandardOutput.ReadToEnd();
        which.WaitForExit(5000);
        return which.ExitCode == 0 && !string.IsNullOrWhiteSpace(output);
    }
    catch
    {
        return false;
    }
}

static void OpenBrowser(string url)
{
    Process.Start(
        new ProcessStartInfo("cmd.exe", $"/c start \"\" \"{url}\"")
        {
            CreateNoWindow = true,
            UseShellExecute = false,
        });
}

/// <summary>Loads repo-root .env into the current process (KEY=VALUE). Does not override existing vars.</summary>
/// <summary>
/// When AI Lite is not disabled and standalone files are missing, run <c>npm run setup:ai-lite</c> (network download).
/// Skips when the user set both binary and model dir in env or when artifacts already exist.
/// </summary>
static void MaybeRunAiLiteSetup(string projectRoot)
{
    if (!OperatingSystem.IsWindows()) return;

    var enabledFlag = Environment.GetEnvironmentVariable("RIBO_AI_UPSCALER_ENABLED");
    if (enabledFlag is "false" or "0" or "no") return;

    var hasBin = !string.IsNullOrEmpty(Environment.GetEnvironmentVariable("RIBO_REALESRGAN_BINARY"));
    var hasModel = !string.IsNullOrEmpty(Environment.GetEnvironmentVariable("RIBO_REALESRGAN_MODEL_DIR"));
    if (hasBin && hasModel) return;

    var engineRoot = Environment.GetEnvironmentVariable("RIBO_REALESRGAN_ENGINE_DIR");
    if (string.IsNullOrWhiteSpace(engineRoot))
        engineRoot = Path.Combine(projectRoot, "tools", "realesrgan");

    var modelName = Environment.GetEnvironmentVariable("RIBO_REALESRGAN_MODEL_NAME");
    if (string.IsNullOrWhiteSpace(modelName)) modelName = AiModelName;

    var binary = hasBin ? Environment.GetEnvironmentVariable("RIBO_REALESRGAN_BINARY")! : Path.Combine(engineRoot, "win-x64", AiExeName);
    var modelDir = hasModel ? Environment.GetEnvironmentVariable("RIBO_REALESRGAN_MODEL_DIR")! : Path.Combine(engineRoot, "models");

    if (File.Exists(binary)
        && Directory.Exists(modelDir)
        && File.Exists(Path.Combine(modelDir, modelName + ".param"))
        && File.Exists(Path.Combine(modelDir, modelName + ".bin")))
    {
        return;
    }

    Console.WriteLine("[Video factory] AI Lite files missing — running npm run setup:ai-lite (requires network) …");
    try
    {
        using var setup = Process.Start(
            new ProcessStartInfo("cmd.exe", "/d /s /c npm run setup:ai-lite")
            {
                WorkingDirectory = projectRoot,
                UseShellExecute = false,
            });
        if (setup is null)
        {
            Console.Error.WriteLine("[Video factory] Could not start npm run setup:ai-lite.");
            return;
        }

        setup.WaitForExit();
        if (setup.ExitCode != 0)
            Console.Error.WriteLine("[Video factory] setup:ai-lite exited with code " + setup.ExitCode + ". AI Lite may stay unavailable.");
        else
            Console.WriteLine("[Video factory] setup:ai-lite finished.");
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine("[Video factory] setup:ai-lite failed: " + ex.Message);
    }
}

static void ApplyRepoDotenvToProcess(string projectRoot)
{
    var path = Path.Combine(projectRoot, ".env");
    if (!File.Exists(path)) return;
    foreach (var line in File.ReadLines(path))
    {
        var trimmed = line.Trim();
        if (trimmed.Length == 0 || trimmed[0] == '#') continue;
        var eq = trimmed.IndexOf('=');
        if (eq <= 0) continue;
        var key = trimmed[..eq].Trim();
        if (key.Length == 0) continue;
        var value = trimmed[(eq + 1)..].Trim();
        if (value.Length >= 2 && ((value[0] == '"' && value[^1] == '"') || (value[0] == '\'' && value[^1] == '\'')))
            value = value[1..^1];
        if (value.Length == 0) continue;
        if (string.IsNullOrEmpty(Environment.GetEnvironmentVariable(key)))
            Environment.SetEnvironmentVariable(key, value);
    }
    PromoteLegacyEnvKeys();
}

/** Copy pre-rebrand VVR_* values onto RIBO_* when the new key is unset. */
static void PromoteLegacyEnvKeys()
{
    foreach (System.Collections.DictionaryEntry entry in Environment.GetEnvironmentVariables())
    {
        var key = entry.Key as string;
        if (key is null || !key.StartsWith("VVR_", StringComparison.Ordinal)) continue;
        var value = entry.Value as string;
        if (string.IsNullOrEmpty(value)) continue;
        var riboKey = "RIBO_" + key["VVR_".Length..];
        if (string.IsNullOrEmpty(Environment.GetEnvironmentVariable(riboKey)))
            Environment.SetEnvironmentVariable(riboKey, value);
    }
}

static void TryKillTree(Process process)
{
    try
    {
        if (!process.HasExited) process.Kill(entireProcessTree: true);
    }
    catch
    {
        // best effort
    }
}

static bool TryApplyAiLiteEnv(string projectRoot, ProcessStartInfo psi, out string note)
{
    note = "";
    if (!OperatingSystem.IsWindows()) return false;

    var enabledFlag = Environment.GetEnvironmentVariable("RIBO_AI_UPSCALER_ENABLED");
    if (enabledFlag is "false" or "0" or "no") return false;

    var hasBin = !string.IsNullOrEmpty(Environment.GetEnvironmentVariable("RIBO_REALESRGAN_BINARY"));
    var hasModel = !string.IsNullOrEmpty(Environment.GetEnvironmentVariable("RIBO_REALESRGAN_MODEL_DIR"));
    if (hasBin && hasModel) return false;

    var engineRoot = Environment.GetEnvironmentVariable("RIBO_REALESRGAN_ENGINE_DIR");
    if (string.IsNullOrWhiteSpace(engineRoot))
        engineRoot = Path.Combine(projectRoot, "tools", "realesrgan");

    var binary = hasBin ? Environment.GetEnvironmentVariable("RIBO_REALESRGAN_BINARY")! : Path.Combine(engineRoot, "win-x64", AiExeName);
    var modelDir = hasModel ? Environment.GetEnvironmentVariable("RIBO_REALESRGAN_MODEL_DIR")! : Path.Combine(engineRoot, "models");
    var modelName = Environment.GetEnvironmentVariable("RIBO_REALESRGAN_MODEL_NAME");
    if (string.IsNullOrWhiteSpace(modelName)) modelName = AiModelName;

    if (!File.Exists(binary)
        || !Directory.Exists(modelDir)
        || !File.Exists(Path.Combine(modelDir, modelName + ".param"))
        || !File.Exists(Path.Combine(modelDir, modelName + ".bin")))
    {
        note = "[Ribo] AI Lite: Unavailable — missing engine, model, or Vulkan support";
        return true;
    }

    if (!ProbeRealesrganHelp(binary, out _))
    {
        note = "[Ribo] AI Lite: Unavailable — missing engine, model, or Vulkan support";
        return true;
    }

    SetChildEnvIfEmpty(psi, "RIBO_AI_UPSCALER_ENABLED", "true");
    if (!hasBin) SetChildEnvIfEmpty(psi, "RIBO_REALESRGAN_BINARY", binary);
    if (!hasModel) SetChildEnvIfEmpty(psi, "RIBO_REALESRGAN_MODEL_DIR", modelDir);
    SetChildEnvIfEmpty(psi, "RIBO_REALESRGAN_MODEL_NAME", modelName);
    SetChildEnvIfEmpty(psi, "RIBO_REALESRGAN_PROJECT_ROOT", projectRoot);

    note = "[Ribo] AI Lite: Ready (standalone engine)";
    return true;
}

static bool ProbeRealesrganHelp(string binary, out bool vulkanFailed)
{
    vulkanFailed = false;
    try
    {
        using var p = new Process
        {
            StartInfo = new ProcessStartInfo
            {
                FileName = binary,
                Arguments = "-h",
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
            },
        };
        p.Start();
        var stdout = p.StandardOutput.ReadToEnd();
        var stderr = p.StandardError.ReadToEnd();
        if (!p.WaitForExit(8000))
        {
            try
            {
                p.Kill(entireProcessTree: true);
            }
            catch
            {
                // ignore
            }

            return false;
        }

        var text = stdout + "\n" + stderr;
        if (Regex.IsMatch(
                text,
                @"no vulkan|vulkan.*not (?:available|found)|vkEnumeratePhysicalDevices failed|failed to create .*vulkan",
                RegexOptions.IgnoreCase))
        {
            vulkanFailed = true;
            return false;
        }

        return p.ExitCode == 0
               || Regex.IsMatch(text, @"usage|realesrgan|upscayl|-i input", RegexOptions.IgnoreCase);
    }
    catch
    {
        return false;
    }
}

static void SetChildEnvIfEmpty(ProcessStartInfo psi, string key, string value)
{
    if (!string.IsNullOrEmpty(Environment.GetEnvironmentVariable(key))) return;
    psi.Environment[key] = value;
}

[DoesNotReturn]
static void Fail(string message)
{
    Console.Error.WriteLine("\n[Video factory] " + message.Replace("\n", "\n[Video factory] "));
    PauseBeforeExit(1);
}

[DoesNotReturn]
static void PauseBeforeExit(int code)
{
    Console.Error.WriteLine("\nPress Enter to close.");
    try
    {
        Console.ReadLine();
    }
    catch
    {
        // ignore
    }

    Environment.Exit(code);
}
