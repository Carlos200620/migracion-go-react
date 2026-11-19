param([Parameter(Mandatory, HelpMessage = 'Correo de Gmail que enviará los códigos')][string]$Email)
$ErrorActionPreference = 'Stop'
$envPath = Join-Path (Split-Path $PSScriptRoot -Parent) 'backend\.env'
if (-not (Test-Path -LiteralPath $envPath)) { throw 'No se encontró backend\.env.' }
$securePassword = Read-Host 'Introduce la contraseña de aplicación de Gmail (16 caracteres, no tu contraseña habitual)' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
    $gmailPassword = ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)) -replace '\s', ''
    if ($gmailPassword -notmatch '^[a-zA-Z0-9]{16}$') { throw 'La contraseña de aplicación debe contener 16 caracteres.' }
    $text = [IO.File]::ReadAllText($envPath)
    $settings = @{ SMTP_HOST='smtp.gmail.com'; SMTP_PORT='587'; SMTP_TLS='starttls'; SMTP_FROM=$Email; SMTP_USERNAME=$Email; SMTP_PASSWORD=$gmailPassword }
    if ($text -notmatch '(?m)^RECOVERY_CODE_SECRET=.{32,}') {
        $bytes = New-Object byte[] 32
        $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
        try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
        $settings.RECOVERY_CODE_SECRET = ([BitConverter]::ToString($bytes)).Replace('-','').ToLowerInvariant()
    }
    foreach ($key in $settings.Keys) {
        $line = $key + '=' + $settings[$key]
        if ($text -match ('(?m)^' + $key + '=.*$')) { $text = [regex]::Replace($text, '(?m)^' + $key + '=.*$', [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $line }) }
        else { $text += "`r`n$line" }
    }
    [IO.File]::WriteAllText($envPath, $text, (New-Object Text.UTF8Encoding($false)))
    Write-Host 'Gmail configurado localmente. Reinicia el backend para aplicar los cambios.'
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    $gmailPassword = $null
    $text = $null
    $securePassword.Dispose()
}
