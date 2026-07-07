# 🏥 DialyGo — Dialysis Clinic & Treatment Management System

> **Final Year Project (FYP)**  
> A comprehensive, role-based healthcare web application designed to streamline hemodialysis clinic operations, appointment bookings, machine tracking, and patient treatment monitoring.

---

## 📌 Project Overview
**DialyGo** bridges the gap between dialysis clinic administrators, medical staff (nephrologists and nurses), and patients. By digitizing clinic workflows, it enhances patient care coordination, optimizes dialysis machine utilization, and automates critical clinical notifications.

---

## ✨ Key Features by User Role

The application provides five distinct interfaces tailored to specific healthcare workflows:

### 🛡️ 1. Admin (`/admin`)
* **User Management:** Create, update, and manage system access for medical staff and patients (`/api/admin/*`).
* **Branch Administration:** Configure and oversee multiple clinic branches (`/admin/branches`).
* **System Rules & Settings:** Configure operational rules, booking policies, and system-wide settings (`/admin/rules`, `/admin/settings`).

### 👔 2. Clinic Manager (`/manager`)
* **Booking Management:** Oversee and approve patient appointment requests (`/manager/bookings`).
* **Machine Allocation:** Track dialysis machine availability, maintenance, and status (`/manager/machines`).
* **Staff Rostering:** Manage nurse and medical staff shift schedules (`/manager/roster`).

### 🩺 3. Nephrologist (`/nephrologist`)
* **Clinical Oversight:** Review patient profiles, treatment progress, and clinical alerts (`/nephrologist`).
* **Notifications:** Receive automated alerts regarding patient status or critical updates (`/nephrologist/notifications`).

### 💉 4. Nurse (`/nurse`)
* **Treatment Execution:** Initiate and log dialysis sessions (`/nurse/treatments/start`).
* **Real-time Monitoring:** Track active patient vitals and treatment progress (`/nurse/treatments/monitor`).
* **Clinical Logging:** Maintain detailed nursing logs and records (`/nurse/logs`).

### 👤 5. Patient (`/patient`)
* **Clinic Search & Booking:** Search for available dialysis slots and request bookings (`/patient/search`).
* **Profile & Medical History:** Manage personal details and view appointment histories (`/patient/profile`).
* **Support & Notifications:** Access patient support and receive appointment updates (`/patient/support`, `/patient/notification`).

---

## 🛠️ Tech Stack

* **Frontend & Framework:** [Next.js](https://nextjs.org/) (App Router) with [TypeScript](https://www.typescriptlang.org/)
* **Styling:** PostCSS / Tailwind CSS (`globals.css`)
* **Backend & Database:** [Supabase](https://supabase.com/) (`src/lib/supabase.ts`)
* **Testing:** [Jest](https://jestjs.io/) for Unit and Integration Testing (`jest.config.js`)
* **Linting & Code Quality:** ESLint (`eslint.config.mjs`)

---

## 4️⃣ Architecture & Project Structure

```text
dialygo/
├── public/                 # Static assets (icons, SVGs, manifest)
├── src/
│   ├── app/                # Next.js App Router (Role-based routes & API endpoints)
│   │   ├── admin/          # Administrator portal
│   │   ├── api/            # Backend API endpoints (admin notifications, user management)
│   │   ├── manager/        # Clinic manager portal (bookings, machines, roster)
│   │   ├── nephrologist/   # Nephrologist portal
│   │   ├── nurse/          # Nurse portal (logs, active treatment monitoring)
│   │   ├── patient/        # Patient portal (search, profile, support)
│   │   └── reset-password/ # Authentication flows
│   ├── components/         # Shared UI components (Sidebar, BottomNav, NotificationInbox)
│   ├── lib/                # Supabase client initialization (`supabase.ts`)
│   ├── services/           # Business logic & external services (`bookingService.ts`)
│   ├── tests/              # Test suites
│   │   ├── integration/    # Auth, concurrency, Google Maps, booking rejection tests
│   │   └── unit/           # Validation rules, machine status, pre-flight checks
│   └── utils/              # Helper utilities (`notificationService.ts`, `validationHelpers.ts`)
├── jest.config.js          # Jest test runner configuration
├── middleware.ts           # Next.js middleware (Authentication & route protection)
└── next.config.ts          # Next.js configuration
