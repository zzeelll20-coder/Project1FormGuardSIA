# FormGuard – Secure Exam Lockdown & Live Proctoring Desktop App

**FormGuard** is a unified desktop application for proctoring Google Forms exams. It eliminates the need for Chrome extensions, Firebase projects, Google Cloud credentials, or API keys.

---

## Key Features

### 🎓 Student Mode (Exam Lockdown Browser)
- **Secure Embedded Google Form**: Students take the exam inside an isolated, secured browser view.
- **Window & Focus Proctoring**: Automatically detects and logs when a student switches windows, clicks another app, uses Alt+Tab, or minimizes the exam.
- **Fullscreen Kiosk Lockdown**: Traps shortcuts like `F12`, `Ctrl+Shift+I`, `Ctrl+R`, and `Ctrl+W` to prevent developer tools or page tampering.
- **Navigation Guard**: Disallows browsing outside the permitted Google Form domains (blocks AI chatbots, external search, and notes).
- **Anti-Copy / Context Menu Lock**: Prevents right-click and unauthorized clipboard extraction.
- **Instant Warning Overlay**: Immediately displays a warning modal if focus is lost and alerts the proctor in real time.

### 👩‍🏫 Teacher Mode (Live Command Center)
- **Zero-Cloud Local Server**: Embedded HTTP + WebSocket server runs directly on the teacher's machine.
- **Instant Join Code**: Generates an easy 4-character code (e.g. `FG-8429`) for students to connect in seconds.
- **Student ID & PIN Verification (Zero Google Login)**: Secure exam access without requiring Google accounts. Teachers issue 4-digit PINs from a class roster.
- **Hardware Device Binding**: Automatically fingerprints and binds the student's computer on check-in. If another user attempts to log in with the same Student ID from a different device, it blocks impersonation immediately.
- **Class Roster Manager**: Built-in tool to paste class lists, auto-generate PINs, and copy clean handout sheets for students.
- **Live Student Status Grid**: Shows cards for every enrolled student with real-time status:
  - 🟢 **Active**: Student is currently focused on the exam form.
  - 🟡 **Away**: Student switched away to another application/window (with away counter and total elapsed time away).
  - 🔴 **Offline**: Connection lost or disconnected.
  - 🔵 **Submitted**: Completed and turned in exam.
- **Real-Time Incident Stream**: Chronological event ticker detailing every violation, window switch, or reconnection as it happens.
- **Student Audit Timeline**: Click any student to view their complete incident log with millisecond-accurate timestamps.
- **Remote Proctor Actions**: Send direct warning messages, remotely force-submit a session, or reset hardware device locks.
- **Audit Export**: Export complete session logs to a structured `.json` audit report with one click.

---

## Getting Started

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher)
- Git

### 2. Installation & Launch
In your terminal (PowerShell, Command Prompt, or Bash):

```bash
# 1. Clone repository (if downloading from GitHub)
git clone https://github.com/zzeelll20-coder/Project1FormGuardSIA.git
cd Project1FormGuardSIA

# 2. Install dependencies (creates the local node_modules folder)
npm install

# 3. Launch application
npm start
# (On Windows, you can also run: npm.cmd start)
```

---

## How It Works

### Testing on a Single Computer
1. Run `npm.cmd start`.
2. Click **Open Command Center** under the **Teacher Hub** card.
3. Note the **Join Code** (e.g., `FG-8429`) displayed at the top.
4. Click **Settings** (⚙️) to set your Google Form URL and exam title.
5. In another terminal, run `npm.cmd start` to launch a second window, or click **Student Client** to test the lockdown flow.
6. Enter student name, student ID, and the **Join Code**, then click **Launch Lockdown Exam**.
7. Switch between apps or click another window — observe the live dashboard immediately update with away counters and incidents!

### Running in a Classroom / Local Wi-Fi
1. The teacher launches FormGuard and clicks **Teacher Hub**.
2. FormGuard displays the teacher's local network IP and port (e.g., `http://192.168.1.50:3456`).
3. Students on the same Wi-Fi launch FormGuard, enter the teacher's IP address in the **Teacher Hub Host / IP** field, enter their name and the **Join Code**, and click start.
4. All telemetry synchronizes in real time over local WebSockets.

---

## Project Structure

```
formguard/
├── package.json         # Electron, Express, and WebSocket dependencies
├── main.js              # Electron main process (native window, kiosk lock, blur tracking)
├── preload.js           # Secure IPC bridge for renderer
├── server.js            # Built-in Express + WebSocket coordinator
├── src/
│   ├── index.html       # Unified UI (Home, Teacher Dashboard, Student Exam Client)
│   ├── css/
│   │   └── style.css    # Dark glassmorphic design system and animations
│   └── js/
│       ├── app.js       # App router and IPC coordinator
│       ├── teacher.js   # Teacher dashboard controller & real-time grid
│       ├── student.js   # Student lockdown client & webview controller
│       └── utils.js     # Time formatting, audio warnings, clipboard helpers
└── README.md
```
