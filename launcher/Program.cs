using System.Diagnostics;
using System.Diagnostics.CodeAnalysis;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

const string MutexName = "Global\\VVR_VideosFactory_StartDevServer";
const string PackageName = "vvr-app";

using var mutex = new Mutex(true, MutexName, out var ownsMutex);
if (!ownsMutex)
{
    Console.Error.WriteLine("[Video factory] Another launcher is already running.");
    Console.Error.WriteLine("Close the other window or stop its dev server before starting again.");
    PauseBeforeExit(1);
}

var exeDir = Path.GetDirectoryName(Environment.ProcessPath) ?? Environment.CurrentDirectory;
var projectRoot = FindProjectRoot(exeDir);
if (projectRoot is null)
{
    Fail(
        "Could not find the project folder (package.json with name \"vvr-app\").\n" +
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

var urlRegex = new Regex(@"Local:\s+(https?://[^\s\]]+)", RegexOptions.IgnoreCase | RegexOptions.Compiled);
var fallbackUrlRegex = new Regex(@"(https?://(?:127\.0\.0\.1|localhost):\d+/?)", RegexOptions.IgnoreCase | RegexOptions.Compiled);

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

devProcess = new Process { StartInfo = psi, EnableRaisingEvents = true };
devProcess.OutputDataReceived += (_, e) => ForwardLine(e.Data, isError: false);
devProcess.ErrorDataReceived += (_, e) => ForwardLine(e.Data, isError: true);

if (!devProcess.Start())
{
    Fail("Could not start npm run dev.");
}

devProcess.BeginOutputReadLine();
devProcess.BeginErrorReadLine();

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

    var match = urlRegex.Match(line);
    if (!match.Success) match = fallbackUrlRegex.Match(line);
    if (!match.Success) return;

    var url = match.Groups[1].Value.TrimEnd('/');
    _ = TryOpenBrowserWhenReady(url);
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
