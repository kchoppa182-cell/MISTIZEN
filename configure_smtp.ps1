# Run from this project folder with: .\configure_smtp.ps1
# Gmail App Passwords are created at https://myaccount.google.com/apppasswords

$sender = Read-Host 'Gmail address to send MISTIZEN emails from'
if ($sender -notmatch '^[^\s@]+@[^\s@]+\.[^\s@]+$') {
    Write-Error 'Enter a valid Gmail address. No settings were changed.'
    exit 1
}

$appPassword = Read-Host '16-character Gmail App Password' -AsSecureString
$supportInbox = Read-Host 'Support inbox (press Enter for kchoppa182@gmail.com)'
if ([string]::IsNullOrWhiteSpace($supportInbox)) {
    $supportInbox = 'kchoppa182@gmail.com'
}
if ($supportInbox -notmatch '^[^\s@]+@[^\s@]+\.[^\s@]+$') {
    Write-Error 'Enter a valid support inbox email address. No settings were changed.'
    exit 1
}

$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($appPassword)
try {
    $appPasswordText = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer).Replace(' ', '')
    if ($appPasswordText.Length -ne 16) {
        Write-Error 'The Gmail App Password must contain 16 characters. No settings were changed.'
        exit 1
    }

    [Environment]::SetEnvironmentVariable('MISTIZEN_SMTP_HOST', 'smtp.gmail.com', 'User')
    [Environment]::SetEnvironmentVariable('MISTIZEN_SMTP_PORT', '587', 'User')
    [Environment]::SetEnvironmentVariable('MISTIZEN_SMTP_USERNAME', $sender, 'User')
    [Environment]::SetEnvironmentVariable('MISTIZEN_SMTP_PASSWORD', $appPasswordText, 'User')
    [Environment]::SetEnvironmentVariable('MISTIZEN_SMTP_FROM', $sender, 'User')
    [Environment]::SetEnvironmentVariable('MISTIZEN_SUPPORT_EMAIL', $supportInbox, 'User')

    # Make the settings available immediately when the Flask server is started
    # from this same PowerShell window; user-level variables apply to new
    # terminal sessions only.
    $env:MISTIZEN_SMTP_HOST = 'smtp.gmail.com'
    $env:MISTIZEN_SMTP_PORT = '587'
    $env:MISTIZEN_SMTP_USERNAME = $sender
    $env:MISTIZEN_SMTP_PASSWORD = $appPasswordText
    $env:MISTIZEN_SMTP_FROM = $sender
    $env:MISTIZEN_SUPPORT_EMAIL = $supportInbox

    Write-Host ''
    Write-Host 'SMTP settings saved successfully.' -ForegroundColor Green
    Write-Host 'Restart the MISTIZEN server in this window, then send a test support message.' -ForegroundColor Green
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
    Remove-Variable appPasswordText -ErrorAction SilentlyContinue
}
