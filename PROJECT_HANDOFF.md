# Project Context Handoff: BJ American School

This document serves as the master architecture and design reference for **BJ American School**.

---

## 🏛️ Project Profile & Branding
*   **School Title**: `BJ American School`
*   **Slogan**: `Learning with Fun in Wayne's Class`
*   **Target Users**: Teacher-centric (Wayne). Elementary school students have physical QR badge stickers on textbooks/contact books.
*   **Teacher Credentials**: `wayneherry` / `[CONFIDENTIAL_TEACHER_PASSWORD]`
*   **Theme Token (Scheme A)**: Deep Navy (`#0A1128`) & Royal Gold (`#F5A623`).

---

## ⚙️ Architecture & Features

### 1. Multi-Class Hub (班級管理大廳)
*   Wayne can create, rename, and delete classes.
*   Selecting a class navigates to that specific classroom's dashboard.
*   Quick "🔄 Switch Class" button in header allows instant navigation between classes.
*   Class and student deletions require Teacher Password verification to prevent accidental data loss.
*   Students and grade items are scoped strictly by `class_id`.

### 2. 10-Stamp Progression System
*   10-cell card grid (`MAX_STAMPS = 10`, 5x2 grid).
*   Points and stamps are decoupled (points: `[-100, -50, +50, +100]`, stamps: purely manual `⭐ +1 / ⭐ -1`).
*   Student Name Editing: Supported via `✏️ Edit` button or clicking student name.

### 3. QR Code Badge Generation & Live Scanner
*   **QR Scanner (📷)**: Live device camera scanning in browser/PWA.
    *   Synthesizes a pleasant audio chime on scan.
    *   Pops up the **Quick Action Modal** with student's 10-stamp card and `+100 / +50 / -50 / -100` buttons.
    *   Includes a "Scan Next" button for consecutive student scanning.
*   **Printable Badges**: In the "Print QR Badges" tab, automatically arranges all students' QR codes with names into printable cards/stickers.

### 4. Zero-Flicker Optimistic Reconciler
*   Maintains a Request-State Lock (`pendingUpdatesRef`) and a 4.5s timestamp lock (`_lastUpdated`).
*   3-second background polling will never overwrite active point/stamp modifications with stale database reads.

### 5. PWA Caching Rules
*   Service Worker `public/sw.js` explicitly excludes all `supabase.co` API requests from caching, ensuring immediate multi-device synchronization.

---

## 🗄️ Database Tables (Supabase)
*   `classes`: `id`, `name`, `created_at`
*   `students`: `id`, `class_id`, `name`, `points`, `manual_stamps`, `created_at`
*   `grade_items`: `id`, `class_id`, `name`, `date`, `max_score`
*   `grades`: `id`, `grade_item_id`, `student_id`, `score` (composite unique key on `grade_item_id, student_id`)
