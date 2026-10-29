[CmdletBinding()]
param([switch]$Inspect, [int]$AppProcessId = 0)

$ErrorActionPreference = 'Stop'
$cnpExecutable = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../app/src-tauri/target/debug/cutnicepro.exe'))
$cnpProcesses = @(Get-Process -Name cutnicepro -ErrorAction SilentlyContinue | Where-Object {
    $_.Path -eq $cnpExecutable -and ($AppProcessId -eq 0 -or $_.Id -eq $AppProcessId)
})
if ($cnpProcesses.Count -ne 1) { throw 'Não foi identificada uma única instância da build padrão. Nenhuma janela foi alterada.' }
$cnpProcess = $cnpProcesses[0]

if (-not ('CutNiceProWindowClose' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;
public static class CutNiceProWindowClose {
    private delegate bool Callback(IntPtr handle, IntPtr value);
    [DllImport("user32.dll")] private static extern bool EnumWindows(Callback callback, IntPtr value);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr handle, out uint process);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr handle);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetClassName(IntPtr handle, StringBuilder text, int count);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowText(IntPtr handle, StringBuilder text, int count);
    [DllImport("user32.dll", SetLastError = true)] private static extern IntPtr SendMessageTimeout(IntPtr handle, uint message, IntPtr wparam, IntPtr lparam, uint flags, uint timeout, out IntPtr result);
    public static bool Matches(IntPtr handle, uint expected) {
        uint process;
        GetWindowThreadProcessId(handle, out process);
        var name = new StringBuilder(256);
        var title = new StringBuilder(256);
        GetClassName(handle, name, name.Capacity);
        GetWindowText(handle, title, title.Capacity);
        return process == expected && IsWindowVisible(handle) && name.ToString() == "Tauri Window" && title.ToString() == "CutNicePro";
    }
    public static IntPtr[] Find(uint process) {
        var matches = new List<IntPtr>();
        EnumWindows((handle, value) => { if (Matches(handle, process)) matches.Add(handle); return true; }, IntPtr.Zero);
        return matches.ToArray();
    }
    public static bool RuntimeTargetExists(uint expected) {
        bool found = false;
        EnumWindows((handle, value) => {
            uint process;
            GetWindowThreadProcessId(handle, out process);
            var name = new StringBuilder(256);
            GetClassName(handle, name, name.Capacity);
            if (process == expected && name.ToString() == "Tao Thread Event Target") found = true;
            return true;
        }, IntPtr.Zero);
        return found;
    }
    public static void Request(IntPtr handle, uint process) {
        if (!Matches(handle, process)) throw new InvalidOperationException("A janela mudou. Nenhum pedido de fechamento foi enviado.");
        IntPtr result;
        if (SendMessageTimeout(handle, 0x0010, IntPtr.Zero, IntPtr.Zero, 0x0002, 3000, out result) == IntPtr.Zero)
            throw new Win32Exception(Marshal.GetLastWin32Error());
    }
}
'@
}

$cnpWindows = @([CutNiceProWindowClose]::Find([uint32]$cnpProcess.Id))
if ($cnpWindows.Count -ne 1) { throw 'A janela visível do editor não foi identificada com segurança. Nenhuma janela foi alterada.' }
$cnpTarget = $cnpWindows[0]
if ($Inspect) {
    [pscustomobject]@{ ProcessId = $cnpProcess.Id; Path = $cnpExecutable; Handle = $cnpTarget.ToInt64(); Class = 'Tauri Window'; Title = 'CutNicePro'; RuntimeTargetPresent = [CutNiceProWindowClose]::RuntimeTargetExists([uint32]$cnpProcess.Id) } | ConvertTo-Json -Compress
    return
}
$cnpProcess.Refresh()
if ($cnpProcess.HasExited -or $cnpProcess.Path -ne $cnpExecutable) { throw 'A instância mudou. Nenhuma janela foi alterada.' }
[CutNiceProWindowClose]::Request($cnpTarget, [uint32]$cnpProcess.Id)
if ($cnpProcess.WaitForExit(8000)) { Write-Output 'CutNicePro encerrado normalmente.' }
else { Write-Output 'Fechamento solicitado ao editor. A instância permanece aberta; preserve a confirmação de salvamento e os trabalhos em andamento.' }
