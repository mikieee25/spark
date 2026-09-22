[CmdletBinding()]
param(
  [string]$BaseUrl,
  [string]$EnvFile,
  [switch]$RunAuthenticatedSmokeTest,
  [switch]$KeepSmokeArtifacts,
  [switch]$SkipDocker,
  [switch]$SkipWriteCheck,
  [switch]$AllowAnonymousMode,
  [string]$ReportPath = (Join-Path (Get-Location) "spark-validation-report.json")
)

$ErrorActionPreference = "Stop"
$results = [System.Collections.Generic.List[object]]::new()
$environment = @{}
$webSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$smokeFolder = $null
$smokeFile = $null
$downloadFile = $null
$passwordPointer = [IntPtr]::Zero
$smokeUserRole = $null

function Add-Result {
  param([string]$Name, [ValidateSet("PASS", "WARN", "FAIL")][string]$Status, [string]$Message, [object]$Details = $null)
  $results.Add([pscustomobject]@{ name = $Name; status = $Status; message = $Message; details = $Details })
  $color = if ($Status -eq "PASS") { "Green" } elseif ($Status -eq "WARN") { "Yellow" } else { "Red" }
  Write-Host ("[{0}] {1}: {2}" -f $Status, $Name, $Message) -ForegroundColor $color
}

function Read-DotEnv([string]$Path) {
  $values = @{}
  if (-not (Test-Path -LiteralPath $Path)) { return $values }
  foreach ($line in Get-Content -LiteralPath $Path) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#")) { continue }
    $separator = $trimmed.IndexOf("=")
    if ($separator -lt 1) { continue }
    $key = $trimmed.Substring(0, $separator).Trim()
    $value = $trimmed.Substring($separator + 1).Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    $values[$key] = $value
  }
  return $values
}

function Invoke-JsonRequest {
  param([string]$Uri, [string]$Method = "GET", [object]$Body = $null, [Microsoft.PowerShell.Commands.WebRequestSession]$Session = $null)
  $parameters = @{ Uri = $Uri; Method = $Method; UseBasicParsing = $true; Headers = @{ Accept = "application/json" } }
  if ($script:origin) { $parameters.Headers.Origin = $script:origin }
  if ($Session) { $parameters.WebSession = $Session }
  if ($null -ne $Body) { $parameters.ContentType = "application/json"; $parameters.Body = ($Body | ConvertTo-Json -Compress) }
  $response = Invoke-WebRequest @parameters
  $parsed = $null
  if ($response.Content) { $parsed = $response.Content | ConvertFrom-Json }
  return [pscustomobject]@{ response = $response; body = $parsed }
}

function ApiUri([string]$Path) { return "$($script:baseUrl.TrimEnd('/'))$Path" }
function LogicalPathUri([string]$Path) { return (ApiUri "/api/files?path=$([uri]::EscapeDataString($Path))") }
function OriginOf([string]$Url) { return ([uri]$Url).GetLeftPart([System.UriPartial]::Authority) }

try {
  $root = (Get-Location).Path
  if (-not $EnvFile) {
    $EnvFile = Join-Path $root ".env"
    if (-not (Test-Path -LiteralPath $EnvFile)) { $EnvFile = Join-Path $root ".env.local" }
  }
  $environment = Read-DotEnv $EnvFile
  if (-not $BaseUrl) { $BaseUrl = $environment["SPARK_ORIGIN"] }
  if (-not $BaseUrl) { $BaseUrl = "http://localhost:38173" }
  $script:baseUrl = $BaseUrl.TrimEnd('/')
  $origin = OriginOf $script:baseUrl
  $script:origin = $origin

  Add-Result "PowerShell" "PASS" $($PSVersionTable.PSVersion.ToString())

  $filesRoot = $environment["SPARK_FILES_ROOT_HOST"]
  if (-not $filesRoot) { $filesRoot = $environment["SPARK_FILES_ROOT"] }
  if (-not $filesRoot) {
    Add-Result "EPRED host root" "FAIL" "Set SPARK_FILES_ROOT_HOST in .env or SPARK_FILES_ROOT in the selected environment file."
  } elseif (-not (Test-Path -LiteralPath $filesRoot -PathType Container)) {
    Add-Result "EPRED host root" "FAIL" "Directory is missing or inaccessible: $filesRoot"
  } else {
    Add-Result "EPRED host root" "PASS" "Directory exists" @{ path = $filesRoot }
    if (-not $SkipWriteCheck) {
      $probe = Join-Path $filesRoot (".spark-validation-{0}.tmp" -f ([guid]::NewGuid().ToString("N")))
      try { [IO.File]::WriteAllText($probe, "SPARK validation probe"); Remove-Item -LiteralPath $probe -Force; Add-Result "EPRED write access" "PASS" "Created and removed a scoped probe file." }
      catch { if (Test-Path -LiteralPath $probe) { Remove-Item -LiteralPath $probe -Force -ErrorAction SilentlyContinue }; Add-Result "EPRED write access" "FAIL" $_.Exception.Message }
    } else { Add-Result "EPRED write access" "WARN" "Skipped by -SkipWriteCheck." }
    $fileCount = @(Get-ChildItem -LiteralPath $filesRoot -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1).Count
    if ($fileCount -gt 0) { Add-Result "OneDrive content" "PASS" "At least one file is visible under the configured root." }
    else { Add-Result "OneDrive content" "WARN" "No files were found; confirm OneDrive/rclone has completed synchronization." }
  }

  if ($SkipDocker) { Add-Result "Docker Compose" "WARN" "Skipped by -SkipDocker." }
  elseif (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Add-Result "Docker Compose" "WARN" "Docker is not installed or not on PATH." }
  else {
    $composeOutput = & docker compose --env-file $EnvFile config --quiet 2>&1
    if ($LASTEXITCODE -eq 0) { Add-Result "Docker Compose" "PASS" "compose.yaml parses successfully." }
    else { Add-Result "Docker Compose" "FAIL" "docker compose config failed." ($composeOutput -join " ") }
    $running = & docker compose --env-file $EnvFile ps --status running --services 2>$null
    if ($running -contains "spark") { Add-Result "SPARK container" "PASS" "The spark service is running." }
    else { Add-Result "SPARK container" "WARN" "The spark service is not running; start it with docker compose up -d --build." }
  }

  try {
    $live = Invoke-JsonRequest (ApiUri "/api/health/live")
    if ($live.body.ok -eq $true) { Add-Result "Liveness" "PASS" "SPARK process is responding." } else { Add-Result "Liveness" "FAIL" "Liveness endpoint did not return ok=true." }
    $header = $live.response.Headers["X-Content-Type-Options"]
    if ($header -eq "nosniff") { Add-Result "Security headers" "PASS" "X-Content-Type-Options=nosniff." } else { Add-Result "Security headers" "WARN" "Expected X-Content-Type-Options=nosniff; received '$header'." }
  } catch { Add-Result "Liveness" "FAIL" $_.Exception.Message }

  try {
    $ready = Invoke-JsonRequest (ApiUri "/api/health/ready")
    if ($ready.body.ok -eq $true) { Add-Result "Readiness" "PASS" "Database, data directory, and files root are ready." } else { Add-Result "Readiness" "FAIL" "Readiness returned ok=false." $ready.body }
  } catch { Add-Result "Readiness" "FAIL" $_.Exception.Message }

  try {
    $access = Invoke-JsonRequest (ApiUri "/api/access/status")
    if ($access.body.requireSignIn -eq $true -or $AllowAnonymousMode) { Add-Result "Access policy" "PASS" $(if ($access.body.requireSignIn) { "Sign-in is required." } else { "Anonymous mode explicitly allowed for this validation." }) }
    else { Add-Result "Access policy" "WARN" "Anonymous mode is active. Use -AllowAnonymousMode only when intentional." }
  } catch { Add-Result "Access policy" "FAIL" $_.Exception.Message }

  try {
    $files = Invoke-WebRequest -Uri (ApiUri "/api/files") -UseBasicParsing -Headers @{ Accept = "application/json" }
    if ($AllowAnonymousMode -or $files.StatusCode -eq 200) { Add-Result "File browse endpoint" "PASS" "The browse endpoint is reachable." }
    else { Add-Result "File browse endpoint" "FAIL" "Unexpected status $($files.StatusCode)." }
  } catch {
    $status = $null
    if ($_.Exception.Response) { $status = $_.Exception.Response.StatusCode.value__ }
    if ($status -eq 401 -and -not $AllowAnonymousMode) { Add-Result "File browse endpoint" "PASS" "Unauthenticated browse is correctly locked." }
    elseif ($status) { Add-Result "File browse endpoint" "FAIL" "Unexpected HTTP status $status." }
    else { Add-Result "File browse endpoint" "FAIL" $_.Exception.Message }
  }

  if ($RunAuthenticatedSmokeTest) {
    if ($PSVersionTable.PSVersion.Major -lt 7) { Add-Result "Authenticated smoke" "FAIL" "PowerShell 7 or newer is required for multipart upload validation." }
    else {
      $username = Read-Host "SPARK username for smoke test"
      $securePassword = Read-Host "SPARK password for smoke test" -AsSecureString
      $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
      try {
        $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
        $login = Invoke-JsonRequest (ApiUri "/api/auth/login") "POST" @{ username = $username; password = $password } $webSession
        if ($login.body.user.mustChangePassword) { throw "This account must change its password before file smoke testing." }
        $smokeUserRole = [string]$login.body.user.role
        Add-Result "Authenticated login" "PASS" "Login succeeded; password hash was not requested or stored by the script."
        $smokeFolder = "SPARK_VALIDATION/$([DateTime]::UtcNow.ToString('yyyyMMddHHmmss'))"
        $smokeName = "validation.txt"
        $smokeLogicalFile = "$smokeFolder/$smokeName"
        $smokeFile = Join-Path $env:TEMP ("spark-validation-{0}.txt" -f ([guid]::NewGuid().ToString("N")))
        Set-Content -LiteralPath $smokeFile -Value "DOE SPARK validation $(Get-Date -Format o)" -NoNewline
        $folderRequest = Invoke-JsonRequest (ApiUri "/api/files/folders") "POST" @{ path = $smokeFolder }
        Add-Result "Create validation folder" "PASS" $smokeFolder
        $upload = Invoke-WebRequest -Uri (ApiUri "/api/files/uploads") -Method Post -WebSession $webSession -UseBasicParsing -Headers @{ Origin = $origin } -Form @{ directory = $smokeFolder; conflict = "fail"; file = Get-Item -LiteralPath $smokeFile }
        Add-Result "Upload validation file" "PASS" $smokeLogicalFile
        $listing = Invoke-JsonRequest (LogicalPathUri $smokeFolder) "GET" $null $webSession
        if (@($listing.body.entries | Where-Object { $_.name -eq $smokeName }).Count -eq 1) { Add-Result "View validation file" "PASS" "File appears in the folder listing." } else { throw "Uploaded file was not returned by the folder listing." }
        $downloadFile = Join-Path $env:TEMP ("spark-validation-download-{0}.txt" -f ([guid]::NewGuid().ToString("N")))
        Invoke-WebRequest -Uri (ApiUri "/api/files/download?path=$([uri]::EscapeDataString($smokeLogicalFile))") -WebSession $webSession -UseBasicParsing -OutFile $downloadFile
        if ((Get-Content -Raw -LiteralPath $downloadFile) -eq (Get-Content -Raw -LiteralPath $smokeFile)) { Add-Result "Download validation file" "PASS" "Downloaded bytes match the uploaded file." } else { throw "Downloaded bytes did not match the uploaded file." }
        Invoke-WebRequest -Uri (ApiUri "/api/files?path=$([uri]::EscapeDataString($smokeLogicalFile))") -Method Delete -WebSession $webSession -UseBasicParsing -Headers @{ Origin = $origin } | Out-Null
        Add-Result "Delete validation file" "PASS" "Delete moved the file to the recycle workflow."
        $recycle = Invoke-JsonRequest (ApiUri "/api/recycle") "GET" $null $webSession
        $entry = @($recycle.body.entries | Where-Object { $_.originalPath -eq $smokeLogicalFile }) | Select-Object -First 1
        if ($entry) { Invoke-JsonRequest (ApiUri "/api/recycle/$($entry.id)/restore") "POST" @{ conflict = "fail" } $webSession | Out-Null; Add-Result "Restore validation file" "PASS" "Recycle entry restored successfully." } else { throw "Deleted validation file was not found in recycle entries." }
        if ($KeepSmokeArtifacts) {
          Add-Result "Smoke artifact cleanup" "WARN" "Preserved $smokeFolder for diagnosis because -KeepSmokeArtifacts was supplied."
        } else {
          try {
            Invoke-JsonRequest (LogicalPathUri $smokeLogicalFile) "DELETE" $null $webSession | Out-Null
            $fileRecycle = Invoke-JsonRequest (ApiUri "/api/recycle") "GET" $null $webSession
            $fileEntry = @($fileRecycle.body.entries | Where-Object { $_.originalPath -eq $smokeLogicalFile }) | Select-Object -First 1
            if ($fileEntry -and $smokeUserRole -eq "admin") { Invoke-JsonRequest (ApiUri "/api/recycle/$($fileEntry.id)") "DELETE" $null $webSession | Out-Null }
            Invoke-JsonRequest (LogicalPathUri $smokeFolder) "DELETE" $null $webSession | Out-Null
            $folderRecycle = Invoke-JsonRequest (ApiUri "/api/recycle") "GET" $null $webSession
            $folderEntry = @($folderRecycle.body.entries | Where-Object { $_.originalPath -eq $smokeFolder }) | Select-Object -First 1
            if ($folderEntry -and $smokeUserRole -eq "admin") { Invoke-JsonRequest (ApiUri "/api/recycle/$($folderEntry.id)") "DELETE" $null $webSession | Out-Null }
            if ($smokeUserRole -eq "admin") { Add-Result "Smoke artifact cleanup" "PASS" "Removed the generated file and folder, including recycle entries." }
            else { Add-Result "Smoke artifact cleanup" "WARN" "Removed active test content; a regular user cannot purge its recycle entries." }
          } catch { Add-Result "Smoke artifact cleanup" "WARN" "Active smoke content was restored; cleanup needs review: $($_.Exception.Message)" }
        }
        Add-Result "Authenticated smoke" "PASS" "Upload, view, download, delete, and restore passed."
      } catch { Add-Result "Authenticated smoke" "FAIL" $_.Exception.Message }
      finally { if ($passwordPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer) }; Remove-Variable password -ErrorAction SilentlyContinue; if ($smokeFile -and (Test-Path -LiteralPath $smokeFile)) { Remove-Item -LiteralPath $smokeFile -Force }; if ($downloadFile -and (Test-Path -LiteralPath $downloadFile)) { Remove-Item -LiteralPath $downloadFile -Force } }
    }
  } else { Add-Result "Authenticated smoke" "WARN" "Not run. Re-run with -RunAuthenticatedSmokeTest on the fileserver PC." }
} catch {
  Add-Result "Validation script" "FAIL" $_.Exception.Message
} finally {
  $report = [pscustomobject]@{ generatedAt = (Get-Date).ToUniversalTime().ToString("o"); baseUrl = $script:baseUrl; environmentFile = $EnvFile; results = @($results) }
  $report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $ReportPath -Encoding utf8
  Write-Host "Report: $ReportPath" -ForegroundColor Cyan
}

if (@($results | Where-Object status -eq "FAIL").Count -gt 0) { exit 1 }
exit 0
