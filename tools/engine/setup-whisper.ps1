param()
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$engineRoot = Join-Path $projectRoot '.tooling/vendor/whisper'
$modelDir = Join-Path $engineRoot 'models'
$binDir = Join-Path $engineRoot 'bin'
New-Item -ItemType Directory -Force -Path $modelDir, $binDir | Out-Null

function Get-VerifiedArtifact([string] $Url, [string] $Target, [string] $Sha256) {
    if (Test-Path -LiteralPath $Target) {
        if ((Get-FileHash -LiteralPath $Target -Algorithm SHA256).Hash -eq $Sha256) { return }
        throw "Arquivo existente com hash divergente: $Target. Preserve-o para diagnóstico antes de reinstalar."
    }
    $temporary = "$Target.part"
    try {
        Invoke-WebRequest -Uri $Url -OutFile $temporary
        if ((Get-FileHash -LiteralPath $temporary -Algorithm SHA256).Hash -ne $Sha256) {
            throw "Checksum divergente no download de $Target"
        }
        Move-Item -LiteralPath $temporary -Destination $Target
    } finally {
        if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary }
    }
}

Write-Output "Destino: $engineRoot. Download inicial: aproximadamente 1,64 GB (motor + modelo)."
$archive = Join-Path $engineRoot 'whisper-bin-x64.zip'
Get-VerifiedArtifact 'https://github.com/ggml-org/whisper.cpp/releases/download/b5454/whisper-bin-x64.zip' $archive '6ba69e3482d7826214f90a6a9c84ca07782aec1e1d0c6a7c30c994fd5d816ccb'
Expand-Archive -LiteralPath $archive -DestinationPath $binDir -Force
Get-VerifiedArtifact 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin' (Join-Path $modelDir 'ggml-large-v3-turbo.bin') '1fc70f774d38eb169993ac391eea357ef47c88757ef72ee5943879b7e8e2bc69'
Write-Output 'Motor e modelo verificados. Nenhuma alteração no PATH ou na instalação do Windows.'
