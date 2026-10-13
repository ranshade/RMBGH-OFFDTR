# RMBGH Attendance Kiosk

## Updates in this version
- Attendance form and Latest Punch result are now displayed side by side in one shared main layout/container.
- The latest successful punch displays employee name, employee number, department, event type, date/time, station, and captured photo. A placeholder is shown until a punch succeeds.
- Added Employee Management at `/?view=manage`: add and search employees, edit details, set active/inactive status, and manage department names.
- Added department API and database migration. Employee department is kept as the department name for compatibility with existing attendance records.
- Attendance logs remain available at `/?view=logs` in a new tab.

## Setup
1. Create a MySQL database (default name in the example is `offline_attendance`).
2. In `backend`, copy `.env.example` to `.env` if needed, set database credentials, and run `php artisan key:generate`.
3. Run `php artisan migrate` in `backend` to create the employee, attendance log, and department tables.
4. Start Laravel with `php artisan serve`.
5. In `frontend`, run `npm install`, then `npm run dev`.
6. Open the Vite local URL. Use **Employee management** to add departments first, then employees.

## API additions
- `GET /api/departments`
- `POST /api/departments` with `{ "name": "...", "code": "..." }`
- `PUT /api/departments/{id}`
- `DELETE /api/departments/{id}` (blocked while employees use the department)
- `PUT /api/employees/{id}` to update name, department, position, or status
- `GET /api/employees?all=1&search=...` for the management directory

## Notes
- `.env` in this package is reset to the safe example values; enter your own local database settings.
- `frontend/node_modules` and `backend/vendor` are not included. Install frontend packages with `npm install`; install PHP dependencies with `composer install` if your backend environment needs them.
- This app currently has no login/authorization layer on the management routes. Keep it on a trusted local network until authentication and role-based access are implemented.
