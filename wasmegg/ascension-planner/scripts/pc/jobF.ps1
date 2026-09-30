# One fine/end-of-line run (2026-09-25) with explicit bands, on N CLI workers. Saved backup only; no
# player ID in this file. Saves the payload and table the Submit button would send; never submits
# (postwatch2.ps1 posts them).
param([string]$who, [string]$preset, [string]$bands, [int]$mingap, [int]$workers)
$ErrorActionPreference = 'Continue'
Set-Location C:\Users\cha12\aaap-runs\wasmegg\ascension-planner
$name = "$who-$preset"
$dir = "C:\Users\cha12\aaap-private\fine0925\$name"
New-Item -ItemType Directory -Force $dir | Out-Null
$spec = "src\stores\zz_e2e_$($name -replace '-','_').spec.ts"
Copy-Item C:\Users\cha12\aaap-private\zz_e2e_fine.spec.ts $spec -Force
$env:E2E_BACKUP = "C:\Users\cha12\aaap-private\$who.json"
$env:E2E_PRESET = $preset
$env:E2E_BANDS = $bands
$env:E2E_MINGAP = "$mingap"
$env:E2E_WORKERS = "$workers"
$env:E2E_BATCH_FACTOR = "4"
$env:E2E_CLI = 'C:\Users\cha12\aaap-runs\wasmegg\ascension-planner\dist-search\fastsearch.js'
$env:E2E_OUTDIR = $dir
$env:E2E_OUT = "$dir\log.txt"
Remove-Item $env:E2E_OUT -ErrorAction SilentlyContinue
"workers $workers, bands $bands, gap $mingap, started $(Get-Date -Format s)" | Add-Content $env:E2E_OUT
npx vitest run ($spec -replace '\\','/') *> "$dir\vitest.log"
"EXIT $LASTEXITCODE $(Get-Date -Format s)" | Add-Content $env:E2E_OUT
Remove-Item $spec -Force -ErrorAction SilentlyContinue
