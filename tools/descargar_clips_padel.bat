@echo off
setlocal
rem ---------------------------------------------------------------------------------------------
rem  Clips de padel para las animaciones del juego (canal KNSU de YouTube, licencia CC BY).
rem  Doble clic y esperar: baja yt-dlp y Deno desde sus paginas oficiales de GitHub (la primera
rem  vez) y luego los 11 videos a esta misma carpeta, cada uno con su audio aparte (.m4a, para
rem  sacar los golpes y los botes). No hace falta Node. Todo queda en descarga.log por si algo falla.
rem ---------------------------------------------------------------------------------------------
set "DEST=%~dp0"
cd /d "%DEST%"
set "LOG=%DEST%descarga.log"
echo Inicio %date% %time% > "%LOG%"
if not exist "herramientas" mkdir "herramientas"

if not exist "herramientas\yt-dlp.exe" (
  echo Bajando yt-dlp ^(github.com/yt-dlp^)...
  curl.exe -L --fail --retry 3 -o "herramientas\yt-dlp.exe" "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe" >> "%LOG%" 2>&1
)
if not exist "herramientas\deno.exe" (
  echo Bajando Deno ^(github.com/denoland^)...
  curl.exe -L --fail --retry 3 -o "herramientas\deno.zip" "https://github.com/denoland/deno/releases/latest/download/deno-x86_64-pc-windows-msvc.zip" >> "%LOG%" 2>&1
  tar -xf "herramientas\deno.zip" -C "herramientas" >> "%LOG%" 2>&1
  del "herramientas\deno.zip" >nul 2>&1
)
if not exist "herramientas\yt-dlp.exe" (
  echo No se pudo bajar yt-dlp. Mira descarga.log
  echo FALLO: sin yt-dlp >> "%LOG%"
  pause
  exit /b 1
)

for %%A in ("hw3AeXSWblI saque" "VBc_tZnlbbA cortado" "ib_9FiYuSfs remate_liftado" "ct4qEtYR4uk derecha" "Vbak4BUCTsw volea" "pTGTSzR8K30 remate" "1CHJvA8ixS8 globo" "51Xns6-r31c bandeja" "0B17bkGJ0B8 bajada" "5XDq5l0rhSg vibora" "_RS6hrCD5SQ salida_de_pared") do (
  for /f "tokens=1,2" %%I in ("%%~A") do (
    echo Bajando %%J ...
    echo ===== %%J %%I >> "%LOG%"
    "herramientas\yt-dlp.exe" --js-runtimes "deno:%DEST%herramientas" -f "bv*[height<=720][ext=mp4]/b[ext=mp4]/b,ba[ext=m4a]/ba" --no-playlist --retries 5 --no-mtime -o "%%J_%%I.%%(ext)s" "https://www.youtube.com/watch?v=%%I" >> "%LOG%" 2>&1
  )
)

echo Fin %date% %time% >> "%LOG%"
echo.
echo Listo. Los videos estan en esta carpeta; ya puedes cerrar la ventana.
pause
