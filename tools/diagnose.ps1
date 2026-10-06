param(
    [string]$BaseUrl = 'https://gemini-proxy-opal-one.vercel.app',
    [string]$Model = 'gemini-3.8-flash',
    [switch]$CheckOnly
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Net.Http
$BaseUrl = $BaseUrl.TrimEnd('/')
if (([uri]$BaseUrl).Scheme -ne 'https') {
    throw 'Use an HTTPS proxy URL.'
}
if ($Model -notmatch '^[A-Za-z0-9._-]+$') { throw 'Invalid model name.' }

$handler = New-Object System.Net.Http.HttpClientHandler
$handler.AllowAutoRedirect = $false
$client = New-Object System.Net.Http.HttpClient($handler)
$client.Timeout = [TimeSpan]::FromSeconds(140)
$script:geminiDiagnosticKey = $null

function Send-DiagnosticRequest {
    param([string]$Path, [string]$Method = 'GET', [string]$Body, [switch]$Authenticated)
    $request = New-Object System.Net.Http.HttpRequestMessage
    $request.Method = New-Object System.Net.Http.HttpMethod($Method)
    $request.RequestUri = [uri]($BaseUrl + $Path)
    if ($Authenticated) { $request.Headers.Add('x-goog-api-key', $script:geminiDiagnosticKey) }
    if ($null -ne $Body -and $Method -eq 'POST') {
        $request.Content = New-Object System.Net.Http.StringContent($Body, [Text.Encoding]::UTF8, 'application/json')
    }
    $response = $null
    try {
        $response = $client.SendAsync($request).GetAwaiter().GetResult()
        $text = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        if ($script:geminiDiagnosticKey) { $text = $text.Replace($script:geminiDiagnosticKey, '[REDACTED]') }
        $mediaType = [string]$response.Content.Headers.ContentType
        Write-Host ("{0} {1}: HTTP {2}; {3}" -f $Method, $Path, [int]$response.StatusCode, $mediaType)
        if (-not $response.IsSuccessStatusCode) {
            Write-Host $text
            throw 'Request failed. The complete response is shown above.'
        }
        return $text
    } finally {
        if ($response) { $response.Dispose() }
        $request.Dispose()
    }
}

try {
    $health = (Send-DiagnosticRequest -Path '/api/proxy') | ConvertFrom-Json
    Write-Host ("Proxy version: {0}; execution region: {1}" -f $health.version, $health.region)
    if ($health.version -ne '3') { throw 'The timeout repair is not deployed yet.' }
    if ($CheckOnly) { return }

    $secureKey = Read-Host 'Paste your Gemini API key (hidden; not saved)' -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
    try {
        $script:geminiDiagnosticKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
        $secureKey.Dispose()
    }
    if ([string]::IsNullOrWhiteSpace($script:geminiDiagnosticKey)) { throw 'An API key is required.' }

    $found = $false
    $pageToken = $null
    do {
        $path = '/api/v1beta/models?pageSize=1000'
        if ($pageToken) { $path += '&pageToken=' + [uri]::EscapeDataString($pageToken) }
        $models = (Send-DiagnosticRequest -Path $path -Authenticated) | ConvertFrom-Json
        foreach ($item in $models.models) {
            if ($item.name -eq "models/$Model" -and $item.supportedGenerationMethods -contains 'generateContent') {
                $found = $true
            }
        }
        $pageToken = $models.nextPageToken
    } while ($pageToken -and -not $found)
    if (-not $found) { throw "Your API did not list $Model with generateContent support. Do not guess a replacement model." }

    $generation = @{ maxOutputTokens = 1024 }
    if ($Model -eq 'gemini-3.8-flash') { $generation.thinkingConfig = @{ thinkingLevel = 'low' } }
    $body = @{ contents = @(@{ parts = @(@{ text = 'Reply only with OK.' }) }); generationConfig = $generation } | ConvertTo-Json -Depth 8 -Compress
    $result = (Send-DiagnosticRequest -Path "/api/v1beta/models/${Model}:generateContent" -Method POST -Body $body -Authenticated) | ConvertFrom-Json
    $reply = @($result.candidates | ForEach-Object { $_.content.parts } | ForEach-Object { $_.text }) -join "`n"
    if ([string]::IsNullOrWhiteSpace($reply)) {
        $result | ConvertTo-Json -Depth 20
        throw 'Google returned HTTP 200 but no text reply. See the response above.'
    }
    Write-Host 'Gemini reply:'
    Write-Host $reply
} finally {
    $script:geminiDiagnosticKey = $null
    $client.Dispose()
    $handler.Dispose()
}
