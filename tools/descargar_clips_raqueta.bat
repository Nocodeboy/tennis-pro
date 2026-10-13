@echo off
setlocal
rem ---------------------------------------------------------------------------------------------
rem  Videos con licencia Creative Commons de tenis, padel y pickleball para sacar animaciones
rem  (la lista y por que cada uno: docs/tenis/videos-cc.md en el repositorio tennis-pro).
rem  Doble clic y esperar: baja yt-dlp y Deno desde sus paginas oficiales de GitHub (la primera
rem  vez) y luego cada video a su carpeta (tenis, padel, pickleball), con su audio aparte en .m4a
rem  para encontrar el golpe por el sonido. Hasta 1080p. No hace falta Node. Si un video ya esta
rem  bajado se salta. Todo queda en descarga.log por si algo falla.
rem ---------------------------------------------------------------------------------------------
set "DEST=%~dp0"
cd /d "%DEST%"
set "LOG=%DEST%descarga.log"
echo Inicio %date% %time% > "%LOG%"
if not exist "herramientas" mkdir "herramientas"
if not exist "tenis" mkdir "tenis"
if not exist "padel" mkdir "padel"
if not exist "pickleball" mkdir "pickleball"

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

rem  Cada linea: id de YouTube, nombre del archivo y carpeta.
for %%A in (
  "SFyLnEbfE-8 derecha_knsu tenis"
  "ICJfRUo3DFE derecha_abierta_splitstep tenis"
  "nW5QJN-0EeQ derecha_club tenis"
  "KSOkU87xrNc derecha_reves_shelton tenis"
  "4JRmd-LrFOo derecha_shapovalov tenis"
  "t9z8UlLssaI derecha_tsitsipas tenis"
  "5lf-t4obkkU derecha_lateral_fonseca tenis"
  "w_dekFrqJ3s reves2_frontal_knsu tenis"
  "QNFNQCKmK7M reves2_lateral_knsu tenis"
  "ZIj79awr3Ss reves2_club tenis"
  "didJM9meWwo reves1_frontal_knsu tenis"
  "3h6a1LgDtkY reves1_lateral_knsu tenis"
  "8BkW9uLqkPM reves_lateral_nadal tenis"
  "Ix3fBtRPWD4 reves1_wawrinka tenis"
  "K8gtQdaWNOE reves_cortado tenis"
  "B7L-MpPws4M volea_derecha_lateral_knsu tenis"
  "cLC17BwdKYw volea_derecha_lateral2_knsu tenis"
  "76jGytGv-hI volea_derecha_aproximacion_knsu tenis"
  "4VxXj0GSP1A volea_derecha_frontal_knsu tenis"
  "CbETmUl-bDI volea_reves_lateral_knsu tenis"
  "TA_FViUBXLU volea_reves_alta_knsu tenis"
  "kE8FnGqPkLI volea_reves_frontal_knsu tenis"
  "PpILO-JALZ8 saque_plano_knsu tenis"
  "OE3xQbuq5fs saque_plano_detras_knsu tenis"
  "nJdUu-5M_2I saque_liftado_zverev tenis"
  "fofFYc-obTI saque_cortado_raonic tenis"
  "6NRbLwWxx6w saque_nadal tenis"
  "H2wDveavYpc saque_liftado_cortado_club tenis"
  "7ElgcnvmVHk remate_ejercicio tenis"
  "pPFw6sJmCUU desplazamientos_federer tenis"
  "KphZtOyEfvs entrenamiento_fonseca tenis"
  "HRHDm17zGrc vibora_volea padel"
  "xBYjEbwa_Wg bandeja_remate_ejercicio padel"
  "9RCXP6v24o4 chiquita padel"
  "JOr9vpYr7Fc remate_por3 padel"
  "_YfpzELsKxc volea_reves_cortada padel"
  "OWOXW0hvYEg voleas_bandeja padel"
  "g_QAAQfEBy8 volea_navarro padel"
  "c66VBs02Q9o posicion_navarro padel"
  "j0TWKlvYres pared_peloteo pickleball"
  "_gtsvq_rvOk dink_reves2 pickleball"
  "rP6D_0JzrM4 drive pickleball"
  "KfnEn9llHFA tercer_golpe_dejada pickleball"
) do (
  for /f "tokens=1,2,3" %%I in ("%%~A") do (
    if exist "%%K\%%J_%%I.mp4" (
      echo Ya estaba: %%K\%%J
    ) else (
      echo Bajando %%K\%%J ...
      echo ===== %%K %%J %%I >> "%LOG%"
      "herramientas\yt-dlp.exe" --js-runtimes "deno:%DEST%herramientas" -f "bv*[ext=mp4]/b[ext=mp4]/b,ba[ext=m4a]/ba" -S "res:1080" --no-playlist --retries 5 --no-mtime -o "%%K\%%J_%%I.%%(ext)s" "https://www.youtube.com/watch?v=%%I" >> "%LOG%" 2>&1
    )
  )
)

echo Fin %date% %time% >> "%LOG%"
echo.
echo Listo. Los videos estan en las carpetas tenis, padel y pickleball; ya puedes cerrar la ventana.
pause
