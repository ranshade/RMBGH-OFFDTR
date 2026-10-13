DTR print (Civil Service Form No. 48) - updated files
======================================================
Copy the contents of "backend" and "frontend" over your project folders (same paths, overwrite).

BACKEND
  1. php artisan migrate        (creates dtr_day_marks: OFF / HOLIDAY / SUSPENDED)
  2. config/attendance.php + the newer AttendanceController.php + .env.example were sitting inside
     your FRONTEND folder by mistake. They are now in backend where they belong.
     Optional: add to backend .env  ->  ATTENDANCE_MIN_GAP_MINUTES=10  and  ATTENDANCE_MAX_SHIFT_HOURS=16
  3. php artisan config:clear

FRONTEND
  1. Delete the stray backend copies inside the frontend folder:
        frontend/config/attendance.php
        frontend/app/Http/Controllers/Api/AttendanceController.php
  2. npm run build   (or npm run dev)

USE
  Admin > Logs > "Print DTR"  (opens /?view=dtr&end=YYYY-MM for that cut-off)
