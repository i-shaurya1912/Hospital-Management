$base = "http://localhost:5000/api"
$json = "application/json"
$AH = @{ Authorization = "Bearer $atoken" }
$PH = @{ Authorization = "Bearer $ptoken" }
$DH = @{ Authorization = "Bearer $doctoken" }

function Get-Status([scriptblock]$call) {
  try { & $call | Out-Null; return 200 } catch { return $_.Exception.Response.StatusCode.value__ }
}

function New-Booking($headers, $docId, $when, $slot, $extra = @{}) {
  $b = @{ doctor = $docId; date = $when; timeSlot = $slot; reason = "Automated test" } + $extra
  Invoke-RestMethod -Method Post -Uri "$base/appointments" -Headers $headers -ContentType $json -Body ($b | ConvertTo-Json)
}

function Set-Status($headers, $id, $body) {
  Invoke-RestMethod -Method Put -Uri "$base/appointments/$id" -Headers $headers -ContentType $json -Body $body
}

# Door ki random date, taaki purane test data se na takraye
$date = (Get-Date).AddDays((Get-Random -Minimum 60 -Maximum 300)).ToString("yyyy-MM-dd", [Globalization.CultureInfo]::InvariantCulture)
$created = @()

$a1 = New-Booking $PH $doctorId $date "09:00 AM"
$created += $a1._id
"1. patient books a slot (expect scheduled): $($a1.status)"

"2. same slot again (expect 409): " + (Get-Status { New-Booking $PH $doctorId $date "09:00 AM" })
"3. past date (expect 400): " + (Get-Status { New-Booking $PH $doctorId "2020-01-01" "09:00 AM" })
"4. slot not in doctor's list (expect 409): " + (Get-Status { New-Booking $PH $doctorId $date "03:17 AM" })

$a2 = New-Booking $PH $doctorId $date "10:00 AM" @{ patient = "6aba3c58ac6d4f9ab43deb61" }
$created += $a2._id
"5. forged patient id ignored (expect True): " + ($a2.patient -eq $patientId)

"6. patient marks completed (expect 403): " + (Get-Status { Set-Status $PH $a1._id '{"status":"completed"}' })
"7. patient also changes date (expect 403): " + (Get-Status { Set-Status $PH $a1._id '{"status":"cancelled","date":"2030-01-01"}' })

"8a. patient cancels own (expect 200): " + (Get-Status { Set-Status $PH $a2._id '{"status":"cancelled"}' })
$a3 = New-Booking $PH $doctorId $date "10:00 AM"
$created += $a3._id
"8b. cancelled slot can be booked again (expect scheduled): $($a3.status)"

$s = Invoke-RestMethod -Uri "$base/doctors/$doctorId/slots?date=$date" -Headers $PH
"9. booked slot hidden from free list (expect False): " + ($s.availableSlots -contains "09:00 AM")

"10. doctor edits another doctor's appointment (expect 403): " + (Get-Status { Set-Status $DH $a1._id '{"status":"cancelled"}' })
"11. admin tries to change the doctor field (expect 400): " + (Get-Status { Set-Status $AH $a1._id "{`"doctor`":`"$ownDoctorId`"}" })

$f = New-Booking $PH $ownDoctorId $date "09:00 AM"
$created += $f._id
"12. doctor completes a future appointment (expect 400): " + (Get-Status { Set-Status $DH $f._id '{"status":"completed"}' })

$l = Invoke-RestMethod -Uri "$base/appointments?status=scheduled&limit=2" -Headers $AH
"13. admin list: total=$($l.total) page=$($l.page) pages=$($l.pages) rows=$($l.appointments.Count)"

# Safai: banayi hui appointments cancel kar do
foreach ($id in $created) {
  try { Set-Status $AH $id '{"status":"cancelled"}' | Out-Null } catch {}
}
"Cleanup done"