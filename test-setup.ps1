$base = "http://localhost:5000/api"

try { Invoke-RestMethod -Uri "http://localhost:5000/" | Out-Null }
catch { Write-Host "Server band hai. Pehle npm run dev chalao." -ForegroundColor Red; return }

function Get-Token($email, $password) {
  $body = @{ email = $email; password = $password } | ConvertTo-Json
  (Invoke-RestMethod -Method Post -Uri "$base/auth/login" -ContentType "application/json" -Body $body).token
}

$adminEmail = "alex.morgan6207@gmail.com"
$sec = Read-Host "Admin password" -AsSecureString
$adminPass = [System.Net.NetworkCredential]::new("", $sec).Password

$atoken   = Get-Token $adminEmail $adminPass
$ptoken   = Get-Token "patient2@test.com" "TestPass123"
$doctoken = Get-Token "drtest@test.com" "TestPass123"

$me = Invoke-RestMethod -Uri "$base/auth/me" -Headers @{Authorization="Bearer $ptoken"}
$patientId = $me.user.patientProfile

$docMe = Invoke-RestMethod -Uri "$base/auth/me" -Headers @{Authorization="Bearer $doctoken"}
$ownDoctorId = $docMe.user.doctorProfile

$doctors = (Invoke-RestMethod -Uri "$base/doctors?limit=50" -Headers @{Authorization="Bearer $atoken"}).doctors
$doctorId = ($doctors | Where-Object { $_.name -eq "Dr. Priya Sharma" })._id

Write-Host "Ready: atoken=$($atoken.Length) ptoken=$($ptoken.Length) doctoken=$($doctoken.Length)" -ForegroundColor Green
Write-Host "patientId=$patientId ownDoctorId=$ownDoctorId doctorId=$doctorId"