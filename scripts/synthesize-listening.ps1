$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$project = Split-Path -Parent $PSScriptRoot
$source = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $project 'data/source/listening.json') | ConvertFrom-Json
$destination = Join-Path $project 'public/listening'
[IO.Directory]::CreateDirectory($destination) | Out-Null
$format = [System.Speech.AudioFormat.SpeechAudioFormatInfo]::new(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)

function Write-Tone($wave) {
  $offset = 12
  while ($offset + 8 -lt $wave.Length) {
    $tag = [Text.Encoding]::ASCII.GetString($wave, $offset, 4)
    $size = [BitConverter]::ToInt32($wave, $offset + 4)
    if ($tag -eq 'data') {
      if ($offset + 8 + $size -ne $wave.Length) { throw 'Unexpected data chunk ending' }
      $samples = 5600
      $output = [byte[]]::new($wave.Length + $samples * 2)
      [Buffer]::BlockCopy($wave, 0, $output, 0, $wave.Length)
      [BitConverter]::GetBytes([int]($output.Length - 8)).CopyTo($output, 4)
      [BitConverter]::GetBytes([int]($size + $samples * 2)).CopyTo($output, $offset + 4)
      for ($sample = 1600; $sample -lt $samples; $sample++) {
        $envelope = [Math]::Min(1, [Math]::Min(($sample - 1600) / 160, ($samples - $sample) / 160))
        $value = [int16](5000 * $envelope * [Math]::Sin(2 * [Math]::PI * 660 * $sample / 16000))
        [BitConverter]::GetBytes($value).CopyTo($output, $wave.Length + $sample * 2)
      }
      return ,$output
    }
    $offset += 8 + $size + ($size % 2)
  }
  throw 'WAV data chunk missing'
}

$synth = [System.Speech.Synthesis.SpeechSynthesizer]::new()
try {
  $voices = @($synth.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.TwoLetterISOLanguageName -eq 'en' } | ForEach-Object { $_.VoiceInfo.Name })
  if (-not $voices.Count) { throw 'An offline Windows English SAPI voice is required for regeneration.' }
  $preferred = @('Microsoft David Desktop', 'Microsoft Hazel Desktop', 'Microsoft Zira Desktop') | Where-Object { $_ -in $voices }
  if ($preferred.Count) { $voices = @($preferred) }
  foreach ($type in 'lecture', 'continuation') {
    $blocks = $source.$type
    for ($block = 0; $block -lt $blocks.Count; $block++) {
      $synth.SelectVoice($voices[$block % $voices.Count])
      $clips = $blocks[$block]
      for ($index = 0; $index -lt $clips.Count; $index++) {
        $file = '{0}-{1}-{2}.wav' -f $type, ($block + 1), ($index + 1)
        $target = Join-Path $destination $file
        $goal = if ($type -eq 'continuation') { 19.65 } else { @(30, 60, 90)[$index] }
        $rate = -2
        $best = $null
        $difference = [double]::PositiveInfinity
        $tried = @{}
        for ($pass = 0; $pass -lt 3 -and -not $tried.ContainsKey($rate); $pass++) {
          $tried[$rate] = $true
          $synth.Rate = $rate
          $synth.SetOutputToWaveFile($target, $format)
          $synth.Speak([string]$clips[$index].script)
          $synth.SetOutputToNull()
          $audio = [IO.File]::ReadAllBytes($target)
          $actual = ($audio.Length - 46) / 32000
          $tempoDistance = [Math]::Abs($actual - $goal)
          if ($tempoDistance -lt $difference) {
            $best = $audio
            $difference = $tempoDistance
          }
          if ($difference -le 0.055 * $goal) { break }
          $delta = [int][Math]::Round([Math]::Log($actual / $goal) / [Math]::Log(1.11))
          if ($delta -eq 0) { $delta = [Math]::Sign($actual - $goal) }
          $rate = [Math]::Max(-6, [Math]::Min(2, $rate + $delta))
        }
        [IO.File]::WriteAllBytes($target, $best)
        if ($type -eq 'continuation') { [IO.File]::WriteAllBytes($target, (Write-Tone ([IO.File]::ReadAllBytes($target)))) }
      }
    }
  }
} finally {
  $synth.Dispose()
}
Write-Output 'Generated 56 offline listening recordings.'
