# Dynamic local ports

Both the development checkout and the portable Windows package use their own
backend launcher and runtime directory. The backend first tries port `8000`;
if it is occupied, the operating system selects an available port while the
launcher keeps the socket bound. Each project records its URL, process ID, and
stop-file path in its own `.runtime/backend-state.json`.

The production frontend is served by that backend and sends API calls to the
same origin using `/api`, so it follows the selected backend port automatically.
The launcher waits for the health endpoint and opens the URL from runtime state.

For development, run `start_backend.ps1` and then `start_frontend.ps1` from the
project folder. The Vite launcher reads the backend URL from that project's
runtime state, proxies `/api` to it, and opens the Vite URL. Vite uses its normal
port selection behavior when its preferred development port is occupied. Use
`stop_backend.ps1` to stop only that checkout's backend.

To run the portable app, double-click its `run_app.bat`. The portable package
has its own code folder, runtime state, logs, and application data folders. Its
launcher never shares the development checkout's process state or data paths.
