# OmniLMS — Inclusive Academic Management Platform
## Proposal for Serving All Students — Online and Offline

---

**Project Name:** OmniLMS  
**Version:** 2.0  
**Prepared On:** August 27, 2026  
**Prepared For:** Internal Stakeholder Review  
**Status:** Proposal

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [The "Offline Student" Challenge](#2-the-offline-student-challenge)
3. [Inclusive Access Strategy](#3-inclusive-access-strategy)
4. [Core Objectives](#4-core-objectives)
5. [Architecture & Technology Stack](#5-architecture--technology-stack)
6. [Feature Modules](#6-feature-modules)
7. [User Roles & Permissions](#7-user-roles--permissions)
8. [Course & Curriculum Management](#8-course--curriculum-management)
9. [Academic Configuration](#9-academic-configuration)
10. [Student Management](#10-student-management)
11. [Academic Progression & Tracking](#11-academic-progression--tracking)
12. [Study Materials & Content Delivery](#12-study-materials--content-delivery)
13. [Attendance Management](#13-attendance-management)
14. [Fee Management & Accounts](#14-fee-management--accounts)
15. [Communication & Notification](#15-communication--notification)
16. [Mobile Applications](#16-mobile-applications)
17. [Offline Student Access Layer](#17-offline-student-access-layer)
18. [Reports & Analytics](#18-reports--analytics)
19. [Security & Compliance](#19-security--compliance)
20. [Implementation Plan](#20-implementation-plan)
21. [Pricing Estimate](#21-pricing-estimate)
22. [Roadmap](#22-roadmap)
23. [Risk Assessment](#23-risk-assessment)
24. [Conclusion](#24-conclusion)

---

## 1. Executive Summary

The OmniLMS is a comprehensive academic management platform built with an inclusive-first philosophy. It ensures every student — regardless of internet connectivity, device ownership, or location — has equal access to educational management services. While the admin panel runs on standard web infrastructure, the platform's communication backbone (WhatsApp, SMS, USSD) and offline-friendly access channels guarantee that students and parents without smartphones or reliable data are never left behind.

### Who This System Serves

| User Type | Access Method | Example |
|-----------|--------------|---------|
| Admin / Teacher | Web panel (any browser) | Laptop in school office |
| Student with smartphone | Mobile app or web portal | Android/iOS device with data |
| Student with basic phone | WhatsApp, SMS, USSD | Nokia feature phone, JioPhone |
| Student with no phone | Printed reports, kiosk, parent's phone | Shared family phone, school computer |
| Parent with smartphone | Parent app, WhatsApp, web | Android/iOS device |
| Parent with basic phone | WhatsApp, SMS, IVR call | Feature phone user |
| Parent with no phone | Printed circulars, school visits | No device ownership |

### Key Design Principles

1. **WhatsApp-first communication** — works on the widest range of phones in India
2. **SMS as universal fallback** — every phone can receive an SMS
3. **USSD for zero-data access** — works on any GSM phone without internet
4. **Printed output support** — all data viewable on paper
5. **Shared-device friendly** — multiple students can use one phone safely
6. **Low-bandwidth first** — works on 2G, under 100KB per page load

---

## 2. The "Offline Student" Challenge

### What "Offline" Means in Context

In the Indian educational landscape, "offline students" refers to students who:

- **Do not own a smartphone** — or share one among family members
- **Lack consistent internet/data** — rural areas, low-income households
- **Use basic/feature phones** — Nokia, JioPhone, or similar devices
- **Have no personal device at all** — access only through school or family
- **Live in low-connectivity zones** — poor network coverage, frequent outages

### Scale of the Challenge

- Over 60% of rural Indian households do not have access to a smartphone
- Feature phone penetration remains significant in tier-3/4 towns and villages
- Many parents cannot afford data plans for regular app usage
- Shared-family-phone is the norm in many households (one phone for 3–5 members)
- During exam season and result announcements, parents urgently need access but may lack devices

### What These Students and Parents Need

| Need | Without Smartphone | With Smartphone |
|------|--------------------|-----------------|---------------------------|
| Know exam results | SMS, printed copy, WhatsApp on basic phone | App notification, web portal |
| Track attendance | Monthly printed report, SMS alert | Real-time in app |
| Pay fees | Cash at school, SMS receipt, printed receipt | Online payment, digital receipt |
| Receive announcements | Printed circular, SMS, WhatsApp | App notification, push |
| View timetable | Printed copy, SMS on request | In-app timetable |
| Communicate with teacher | SMS, phone call, parent meeting at school | In-app chat, WhatsApp |
| Access study materials | Printed handout, school computer lab | Download, in-app viewer |

---

## 3. Inclusive Access Strategy

### 3.1 The Communication Pyramid

```
                        ┌─────────────────────┐
                        │   Smartphone App    │
                        │   (iOS + Android)   │
                        ├─────────────────────┤
                        │   WhatsApp / Web     │
                        │   (Smart + Basic)   │
                        ├─────────────────────┤
                        │   SMS / USSD / IVR   │
                        │   (Any Phone)       │
                        ├─────────────────────┤
                        │  Printed Reports    │
                        │  (No Device Needed) │
                        └─────────────────────┘
```

Every piece of information flows down through all layers — no student is missed.

### 3.2 Access Channel Matrix

| Channel | Device Required | Data Required | Information Available |
|---------|----------------|---------------|----------------------|
| Admin Web Panel | Laptop/Desktop | Internet | Full management |
| Teacher Portal | Laptop/Tablet | Internet | Class management |
| Parent App (Flutter) | Smartphone | Internet | Full student data |
| Student Portal (PWA) | Any browser | Internet | Materials, timetable |
| WhatsApp | Any phone with WA | Minimal data | Results, alerts, chat |
| SMS | Any phone | None | Alerts, receipts, results |
| USSD | Any GSM phone | None | Attendance, fees, results |
| IVR Voice Call | Any phone | None | Results, attendance (audio) |
| Printed Reports | None | None | Report cards, receipts |
| Kiosk/School Lab | School computer | School internet | Full portal access |
| Community Center | Shared computer | Community internet | Portal access |

### 3.3 Design Philosophy

- **Every notification is delivered via at least 2 channels** (e.g., WhatsApp + SMS, or SMS + printed)
- **Every report is available in at least 3 formats** (digital, print, SMS summary)
- **No critical information is locked behind a single access method**
- **USSD and SMS work without data plans or smartphones**
- **The admin can trigger any communication in any format with one click**

---

## 4. Core Objectives

1. **Zero-exclusion academic management** — serve every student regardless of device or connectivity
2. **WhatsApp as the primary parent channel** — highest penetration, lowest friction
3. **SMS + USSD as universal fallback** — works on every phone, no exceptions
4. **Admin-first course creation** — unlimited courses, standards, and curricula defined by institution
5. **Complete academic lifecycle** — registration to graduation, one platform
6. **Automated communication** — no manual follow-ups for attendance, fees, results
7. **Parent engagement** — even without smartphones, parents stay informed
8. **Financial transparency** — complete accounts, fee management, payroll
9. **Data-driven decisions** — reports for every stakeholder
10. **Affordable deployment** — works on existing hardware, minimal infrastructure

---

## 5. Architecture & Technology Stack

### Frontend Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Admin Panel | React 18 + TypeScript | Institution management, reports, configuration |
| Teacher Portal | React 18 + TypeScript | Teaching tools, attendance, grading |
| Student Portal | React PWA | Study materials, assignments, results |
| USSD Interface | Node.js + AfricasTalking/Exotel | Basic phone access |
| IVR Interface | Twilio / Plivo | Voice-based result delivery |
| State Management | Zustand | Lightweight state |
| UI Library | Tailwind CSS + ShadCN | Consistent, accessible UI |
| Reports | PDFKit + ExcelJS | PDF and Excel generation |

### Backend Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Runtime | Node.js 20 LTS | Backend API |
| Framework | Express + TypeScript | API server |
| ORM | Prisma | Database access |
| Authentication | JWT + Refresh Tokens | Secure auth |
| WhatsApp | Baileys (unofficial) / Meta Business API | WhatsApp messaging |
| SMS | Twilio / MSG91 / TextLocal | SMS delivery |
| USSD | AfricasTalking / Exotel / Direct SIM | USSD sessions |
| IVR | Twilio / Plivo | Voice calls |
| Email | Nodemailer + SendGrid | Email delivery |
| Queue | BullMQ (Redis) | Background jobs |
| File Generation | PDFKit, Puppeteer | Reports, certificates |
| Scheduling | node-cron / BullMQ | Automated tasks |

### Database

| Database | Usage |
|----------|-------|
| PostgreSQL | Primary database |
| SQLite | Lightweight reporting, exports |
| Redis | Cache, session, job queue |
| Firebase (optional) | Mobile app push notifications |

### Infrastructure

| Component | Solution |
|-----------|----------|
| Hosting | VPS / Dedicated server (on-premise friendly) |
| Reverse Proxy | Nginx |
| SSL | Let's Encrypt |
| Backup | Automated daily dumps + S3 |
| Monitoring | PM2 + health checks |
| Containerization | Docker (optional) |

---

## 6. Feature Modules

### 6.1 Institution Management
- Multi-institution support
- Institution profile, logo, branding
- Multiple branches/campuses
- Branch-level admin assignment
- Institution-specific settings

### 6.2 Course & Curriculum Management
- Admin-defined unlimited courses
- Pre-loaded templates for Indian standards (1st–10th, Plus One/Plus Two, B.Com, BCA, BBA, B.Sc)
- Custom course creation (admin adds any course on demand)
- Curriculum builder with chapter/unit/topic hierarchy
- Syllabus attachment (PDF)
- Learning outcomes per topic
- Prerequisite mapping
- Course status: Draft / Active / Archived

### 6.3 Academic Year & Calendar
- Multiple academic year management
- Term/semester definitions
- Working days configuration
- Holiday management
- Exam schedule calendar
- Event management (sports day, parent-teacher meetings, etc.)
- Calendar export

### 6.4 Timetable Management
- Class-wise timetable
- Teacher-wise timetable
- Subject-wise period allocation
- Room assignment
- Substitute teacher management
- Conflict detection
- Print/export for display on notice boards

### 6.5 Fee Structure Management
- Course-based fee configuration
- Category-based fees (General, OBC, SC/ST, Management)
- Installment-based payment plans
- Scholarship/concession management
- Late fee configuration
- Online payment (Razorpay/Paytm/PhonePe)
- Cash payment recording
- Receipt generation (print + digital)
- Fee defaulters tracking
- Automated reminders (WhatsApp + SMS)

### 6.6 Student Management
- Online and offline (admin-entered) registration
- Bulk import via Excel/CSV
- Auto-generated registration numbers
- Personal + guardian details
- Multiple guardian contacts
- Previous academic records
- Document management
- Student promotion to next standard
- TC, Bonafide, Character certificate generation

### 6.7 Academic Progression
- Subject-wise performance tracking
- Progress card generation
- GPA / Percentage calculation
- Class rank / position
- Strengths and weaknesses analysis
- Learning gap identification
- Remedial class recommendations
- Academic history (year-over-year)
- Competency-based progress mapping

### 6.8 Study Materials & Content Delivery
- Chapter-wise notes, PDFs, videos
- E-library with categorized resources
- External resource links
- Low-bandwidth optimized delivery
- Printable handout generation
- Material sharing with date ranges
- Reading assignment creation

### 6.9 Attendance Management
- Daily attendance marking (web + mobile)
- Subject-wise attendance
- Bulk attendance entry
- Attendance percentage calculation
- Low attendance alerts (WhatsApp + SMS)
- Monthly printed attendance reports
- Leave application and approval
- Proxy detection (pattern analysis)

### 6.10 Assessment & Examination
- Multiple exam types (Unit Test, Quarterly, Half-Yearly, Annual)
- Objective and subjective questions
- Auto-evaluation for objective type
- Grading system configuration
- Mark entry and moderation
- Result publishing
- Report card generation (printable PDF)
- Rank list generation
- Exam timetable management
- Hall ticket generation
- Re-evaluation requests

### 6.11 Homework & Assignments
- Assignment creation by teachers
- File attachments
- Deadline management
- Online submission (where possible)
- Printed assignment slips for offline students
- Grading and feedback
- Late submission tracking
- Parent visibility

### 6.12 Accounts & Finance
- Fee collection and tracking
- Expense management
- Vendor management
- Salary management and payroll
- Income/expense categorization
- Financial year management
- Balance sheet, P&L, cash flow
- Receipt and invoice generation
- Audit trail
- Tax computation (GST)

### 6.13 Staff/Employee Management
- Teacher and staff profiles
- Attendance and leave management
- Salary structure
- Payslip generation
- Performance evaluation
- Document management
- Role assignment

### 6.14 Library Management
- Book inventory
- ISBN-based cataloging
- Book issuing and returning
- Fine calculation
- Book search
- Digital library (e-books, PDFs)
- Reading history

---

## 7. User Roles & Permissions

| Role | Access Level | Key Features |
|------|-------------|-------------|
| **Super Admin** | Full system | Institution creation, global settings |
| **Institution Admin** | Full institution | All management, reports, billing |
| **Branch Admin** | Per branch | Branch operations, limited admin |
| **Teacher** | Assigned classes | Attendance, marks, materials, reports |
| **Accountant** | Financial | Fees, expenses, salary, reports |
| **Librarian** | Library | Book management, issuing |
| **Student** | Own data | Materials, assignments, attendance |
| **Parent** | Child's data | All channels (app, WhatsApp, SMS, print) |

---

## 8. Course & Curriculum Management

### 8.1 Default Course Templates (Pre-loaded)

The system ships with pre-configured courses for all major Indian academic standards:

| Standard | Course Name | Default Subjects |
|----------|------------|-----------------|
| Standard 1–5 | Primary School | English, Mathematics, EVS, Language (Malayalam/Hindi/Tamil) |
| Standard 6–8 | Upper Primary | English, Mathematics, Science, Social Science, Language |
| Standard 9–10 | High School | English, Mathematics, Science, Social Science, Language |
| Plus One | HSC - Science | Physics, Chemistry, Maths/Bio, English, Language |
| Plus One | HSC - Commerce | Accountancy, Business Studies, Economics, English, Language |
| Plus One | HSC - Humanities | History, Political Science, Economics, English, Language |
| Plus Two | HSC - Science | Physics, Chemistry, Maths/Bio, English, Language |
| Plus Two | HSC - Commerce | Accountancy, Business Studies, Economics, English, Language |
| Plus Two | HSC - Humanities | History, Political Science, Sociology, English, Language |
| B.Com | Bachelor of Commerce | Financial Accounting, Corporate Law, Business Stats, Taxation |
| BCA | Bachelor of Computer Applications | C Programming, Data Structures, DBMS, Web Tech |
| BBA | Bachelor of Business Administration | Management, Marketing, Finance, HR |
| B.Sc | Bachelor of Science | Physics/Chem/Bio/Maths (elective-based) |

### 8.2 Custom Course Creation

Admin can add any new course or standard:
- Course name, code, duration
- Eligibility criteria
- Custom syllabus upload
- Assessment pattern
- Fee structure
- Teacher assignment
- Certificate template

### 8.3 Curriculum Builder

- Drag-and-drop chapter builder
- Multi-level topic hierarchy
- Learning objectives per topic
- Estimated hours per chapter
- Video/audio/PDF attachment
- Quiz/test mapping
- Completion criteria

---

## 9. Academic Configuration

### 9.1 Academic Year Management

- Multiple concurrent academic years
- Term/semester definitions
- Start and end dates per term
- Working days per term
- Grade promotion rules
- Copy from previous year
- Year-end archival and rollover

### 9.2 Academic Calendar

- Term dates and holidays
- Exam schedule
- Assignment deadlines
- Events (sports day, annual day, PTM)
- Staff meetings
- Custom events
- Calendar export

### 9.3 Timetable Management

- Class-wise timetable
- Teacher-wise timetable
- Period-wise scheduling
- Room assignment
- Substitute teacher management
- Conflict detection
- Print/export for notice board display

---

## 10. Student Management

### 10.1 Multi-Channel Registration

**Online (Smartphone/Computer):**
1. Parent/student fills form on web portal
2. Uploads documents
3. Selects course
4. Pays registration fee
5. Admin reviews and approves
6. Auto-generated registration number

**Offline (Admin Entry):**
1. Parent visits school and submits paper form
2. Admin enters data into system
3. Documents scanned and attached
4. Registration number generated
5. Printed acknowledgement given to parent

**Bulk Import:**
1. Admin uploads Excel/CSV with student data
2. System validates and imports
3. Auto-generates registration numbers
4. Printable ID cards and acknowledgement slips generated

### 10.2 Student Profile

```
Personal: Name, DOB, Gender, Blood Group, Photo, Aadhaar
Contact: Address, Phone, Email, GPS Location
Guardians: Father (name, phone, occupation), Mother (name, phone, occupation), Local Guardian
Academic: Standard, Section, Roll No, Reg No, Admission Date, History
Documents: Photo, Birth Certificate, Previous Marks, TC
```

### 10.3 Bulk Operations

- Bulk import (CSV/Excel)
- Bulk promotion to next standard
- Bulk section reallocation
- Bulk fee assignment
- Bulk communication (WhatsApp + SMS batch)
- Bulk ID card printing

---

## 11. Academic Progression & Tracking

### 11.1 Performance Dashboard

- Overall attendance (circular progress)
- GPA with trend
- Subject-wise bar chart
- Assignment completion rate
- Upcoming exams
- Recent marks
- Class rank
- AI-generated improvement suggestions

### 11.2 Progress Card

- Subject-wise marks and grades
- Co-curricular activities
- Attendance record
- Teacher remarks
- Principal's signature
- Digital PDF + print-ready version
- Delivered via: App + WhatsApp PDF + Printed copy

### 11.3 Offline-Friendly Tracking

- Monthly printed progress summaries
- SMS-based result delivery (concise format)
- WhatsApp message with key stats
- Parent-teacher meeting scheduling for detailed discussion

---

## 12. Study Materials & Content Delivery

### 12.1 Material Types

| Type | Formats | Delivery Method |
|------|---------|----------------|
| Documents | PDF, DOC, PPT | Download, WhatsApp, Print handout |
| Video | MP4 (low bitrate) | Stream, download, school lab |
| Audio | MP3 | Download, WhatsApp audio |
| Images | JPG, PNG | View, WhatsApp, Print |
| E-books | EPUB, PDF | Download, school library |
| Printed Handouts | PDF → Print | Physical copies in class |

### 12.2 Content Organization

- Chapter-wise folders
- Subject-wise categorization
- Tags for search
- Version control
- Expiry dates
- Access control (standard-wise)

### 12.3 Offline Delivery

- Printed chapter summaries for students without devices
- WhatsApp document sharing (lightweight PDFs)
- School computer lab access during free periods
- Community center / Panchayat computer access points
- Low-bandwidth optimized streaming (adaptive quality)

---

## 13. Attendance Management

### 13.1 Attendance Modes

| Mode | Device | Who Uses |
|------|--------|----------|
| Web Panel | Laptop/Desktop | Teacher in staff room |
| Mobile App | Smartphone | Tech-savvy teacher |
| Biometric | Fingerprint scanner | Institutions with budget |
| Printed Register → Digital Entry | Paper + later entry | Backup / power outage |

### 13.2 Attendance Workflow

```
Morning:
1. Teacher marks attendance on web panel (or paper backup)
2. System calculates attendance percentage
3. Low-attendance students flagged
4. End of day: automated WhatsApp + SMS to parents of absentees
5. Monthly: attendance report generated
6. Printed attendance summary sent home with student
```

### 13.3 Offline-Friendly Features

- Paper register as fallback — admin can digitize later
- Monthly printed attendance slip sent home
- SMS alert for each absence (no smartphone needed for parent)
- WhatsApp summary at end of every week
- Attendance certificate on demand (printed)

### 13.4 Leave Management

- Online application (where possible)
- Phone call to school office (backup)
- Approval via admin panel
- SMS confirmation to parent
- Leave balance SMS on request

---

## 14. Fee Management & Accounts

### 14.1 Fee Structure

- Course-based fees (admin-configured)
- Category-wise concessions (General, OBC, SC/ST, Management)
- Installment plans
- Late fees
- Scholarships

### 14.2 Fee Collection Channels

| Method | Description |
|--------|-------------|
| Online Payment | Razorpay/Paytm/PhonePe (smartphone parents) |
| Cash at School | Admin records payment, generates receipt |
| Bank Transfer | Parent transfers, admin confirms |
| Bank Drop Box | Physical drop, admin reconciles |

### 14.3 Receipt Delivery

Every fee payment generates a receipt delivered via **all applicable channels**:
- 📱 **WhatsApp** — digital receipt with payment details
- 📱 **SMS** — concise receipt (amount, date, receipt number)
- 📄 **Printed** — physical receipt handed to student
- 📧 **Email** — if parent has email

### 14.4 Fee Reminders (Multi-Channel)

```
7 days before due:  WhatsApp message + SMS
3 days before due:  WhatsApp message + SMS + Printed notice
Day of due:         SMS + Printed notice
After due:          SMS + Phone call from admin + Printed notice sent home
```

### 14.5 Accounts Module

- Expense tracking
- Vendor management
- Salary management
- Payroll processing
- Financial reports (P&L, Balance Sheet, Cash Flow)
- Audit trail
- Tax computation (GST)

---

## 15. Communication & Notification

### 15.1 WhatsApp — Primary Channel

WhatsApp is the backbone of parent communication because:
- Works on smartphones AND basic phones (via WhatsApp Web or multi-device)
- Supports text, PDF, images, audio
- Read receipts available
- Most widely used app in India (600M+ users)
- Group broadcast for class-level announcements
- Two-way chat between teacher and parent

**Automated WhatsApp Messages:**

| Message | Trigger | Recipient |
|---------|---------|-----------|
| Daily Attendance | End of school day | Parent (if absent) |
| Weekly Summary | Every Friday | Parent (all) |
| Fee Due Reminder | 7 days before | Parent |
| Fee Receipt | After payment | Parent |
| Exam Result | After publishing | Parent |
| Holiday Notice | Day before | Parent |
| Event Reminder | 1 day before | Parent |
| Absence Alert | Real-time | Parent |
| Low Attendance | Monthly | Parent (if < 75%) |
| Teacher Message | As needed | Parent |

### 15.2 SMS — Universal Fallback

Every parent receives an SMS regardless of device:
- Attendance alerts
- Fee reminders
- Fee receipts
- Exam results (concise format)
- Holiday notices
- Emergency alerts
- Result notification (USSD code to hear details)

**SMS Templates:**

```
[School Name]
Attendance: Your ward [Name] was absent on [Date].
Reg: [REG001]

[School Name]
Fee due: ₹[Amount] for [Name]. Due: [Date].
Pay at school office. Reg: [REG001]

[School Name]
Result: [Name] - [Subject]: [Mark]/[Max]. 
Total: [Total]/[Max]. Rank: [Rank]/[Total].
```

### 15.3 USSD — Zero-Data Access

For parents with basic phones and no data:

```
USSD Flow:
*123# → Welcome to [School] Student Portal
1 → Attendance
    Enter Reg No: 1234
    → [Name]: Present [X] days out of [Y]. [Z]% attendance
2 → Fees
    Enter Reg No: 1234
    → Pending: ₹[Amount]. Last paid: ₹[Amount] on [Date]
3 → Exam Results
    Enter Reg No: 1234
    → Recent: [Exam Name]
       [Subject1]: [Mark]/[Max]
       [Subject2]: [Mark]/[Max]
       Total: [Total]/[Max]  Percentage: [X]%
4 → Noticeboard
    → [Latest announcement text]
0 → Exit
```

**USSD Benefits:**
- Works on any GSM phone (Nokia, JioPhone, etc.)
- No internet/data required
- No app installation needed
- Session-based, secure with registration number
- Available 24/7

### 15.4 IVR — Voice Call Delivery

For parents who cannot read well:
- Pre-recorded voice messages for results
- Automated voice calls for attendance
- Key information delivered via phone call
- Language selection (English, Malayalam, Hindi, etc.)

### 15.5 Printed Communication

- Monthly progress reports (printed, sent home with student)
- Fee receipts (printed)
- Event circulars
- Holiday notices
- Examination schedules
- Report cards
- Parent-teacher meeting invitations

### 15.6 Email

- Detailed progress reports
- Admission confirmations
- TC and certificates
- Bulk newsletters
- Receipts with attachments

---

## 16. Mobile Applications

### 16.1 Parent Mobile App (Flutter — iOS + Android)

For parents with smartphones:

| Module | Features |
|--------|----------|
| Dashboard | Overview of all children, quick stats |
| Attendance | Daily/weekly/monthly view, alerts |
| Marks | Exam results, progress card, analytics |
| Fees | Outstanding, payment history, online pay |
| Homework | Pending assignments, submissions |
| Timetable | Daily/weekly schedule |
| Notifications | Notification center |
| Chat | Direct message to class teacher |
| Events | School calendar |
| Leave | Apply for student leave |
| Profile | Parent profile, linked students |

**Multi-Child Support:** Parents with 2+ students see all children in one app.

### 16.2 Student App (PWA)

- Study materials (download for offline viewing)
- Assignment submission
- Attendance history
- Timetable
- Exam schedule and results
- Performance dashboard
- Achievement badges

**PWA Benefits:**
- Installable without app store
- Works offline (cached materials)
- Low storage footprint
- Auto-updates

---

## 17. Offline Student Access Layer

### 17.1 The Problem We Solve

A student without a smartphone or data connection should never be at an information disadvantage. The OmniLMS ensures this through a multi-layered delivery system:

### 17.2 Delivery Channels for Offline Students

| Information | Channel 1 | Channel 2 | Channel 3 | Channel 4 |
|-------------|-----------|-----------|-----------|-----------|
| Exam Results | WhatsApp | SMS | USSD | Printed copy |
| Attendance | SMS (daily) | Weekly WhatsApp | Monthly print | USSD |
| Fee Due | WhatsApp | SMS | Printed notice | Phone call |
| Fee Receipt | WhatsApp | SMS | Printed copy | Email |
| Holiday Notice | WhatsApp | SMS | Printed circular | |
| Exam Schedule | WhatsApp | SMS | Printed copy | |
| PTM Invitation | WhatsApp | SMS | Printed slip sent home | |
| Report Card | WhatsApp PDF | Email | Printed copy | |
| Assignment | WhatsApp | Printed handout | School display | |

### 17.3 Shared Device Strategy

In households with one phone shared among family members:

- **PIN-protected profiles** — each student has a unique PIN
- **Switch profiles** without logging out
- **No personal data exposure** between siblings
- **WhatsApp on one number** — admin sends to parent's number, message includes child's name clearly
- **Kiosk mode** at school — students can check results/materials on school tablets/computers

### 17.4 School Computer Lab Access

- Student portal accessible on school computers
- Login with registration number + PIN
- Browse materials, submit assignments, check results
- Lab schedule posted for student access
- Teacher supervision during lab hours

### 17.5 Community Access Points

- Partner with local community centers / Panchayat offices
- Install a terminal with student portal access
- Students visit with registration number to check results/materials
- Admin manages remote access permissions

### 17.6 Printed Materials

- **Monthly Progress Report** — one-page summary (attendance, marks, fee status)
- **Report Card** — detailed term report, printed on school letterhead
- **Exam Hall Ticket** — printed before every exam
- **Time Table** — printed at start of term
- **Study Handouts** — printed chapter summaries for students without digital access
- **Fee Receipt** — printed at time of payment

All printed documents include:
- Student name and registration number
- School logo and contact
- QR code (optional) linking to digital copy

### 17.7 Low-Bandwidth Optimization

- Web pages under 100KB initial load
- Compressed images (WebP format)
- Lazy loading for materials
- Text-only mode option for very slow connections
- Progressive loading (content first, styling later)
- AMP-style lightweight pages for basic phones via WhatsApp links

### 17.8 Language & Accessibility

- Multi-language support: English + regional languages (Malayalam, Hindi, Tamil, etc.)
- SMS templates in local language
- USSD prompts in local language
- IVR voice messages in local language
- Printed materials in local language
- Simple vocabulary — no jargon

---

## 18. Reports & Analytics

### 18.1 Student Reports

| Report | Delivery Channels |
|--------|------------------|
| Attendance Register | PDF, Excel, Print |
| Monthly Attendance Summary | SMS to parent, Print, WhatsApp |
| Progress Card | PDF, WhatsApp, Print |
| Mark List | PDF, Excel, SMS summary |
| Rank List | PDF, Print, WhatsApp |
| Fee Statement | SMS, Print, WhatsApp |
| TC / Bonafide / Character Certificate | PDF, Print |
| Attendance Certificate | PDF, Print |

### 18.2 Teacher Reports

| Report | Description |
|--------|-------------|
| Class Performance | Subject-wise class performance |
| Attendance Analysis | Attendance trends |
| Assignment Completion | Submission rates |
| Exam Analysis | Pass %, average, toppers |
| Teaching Load | Classes and subjects assigned |

### 18.3 Management Reports

| Report | Description |
|--------|-------------|
| Institution Overview | Dashboard with key metrics |
| Enrollment Trends | Admission trends |
| Revenue Report | Fee collection, pending |
| Expense Report | Category-wise spending |
| Staff Report | Teacher count, attendance |
| Inventory Report | Books, assets, supplies |

### 18.4 Financial Reports

| Report | Description |
|--------|-------------|
| Fee Collection | Daily/monthly/yearly |
| Outstanding Dues | Students with pending fees |
| Income Statement | All revenue |
| Expense Ledger | Detailed expenses |
| Balance Sheet | Financial position |
| Cash Flow | Monthly inflow/outflow |
| Payroll Summary | Salary, deductions |
| Tax Reports | TDS, GST summaries |

### 18.5 Custom Reports

- Drag-and-drop report builder
- Custom filters and grouping
- Scheduled generation
- Auto-email/SMS delivery
- Dashboard widgets
- Multi-format export (PDF, Excel, CSV)

### 18.6 Analytics Dashboard

- Enrollment stats
- Attendance trends
- Fee collection heat map
- Academic performance trends
- Parent engagement metrics (WhatsApp open rates, SMS delivery)
- Communication effectiveness tracking
- At-risk student identification

---

## 19. Security & Compliance

### 19.1 Authentication

- JWT with refresh tokens
- Role-based access control (RBAC)
- Password hashing (bcrypt)
- Two-factor authentication (optional)
- Session management

### 19.2 Data Security

- TLS/SSL for all communications
- Encrypted sensitive fields
- Secure file storage
- Audit logging
- Automated backups

### 19.3 Compliance

- Student data privacy (no third-party sharing)
- Indian data protection guidelines
- Secure data deletion on request
- Right to erasure support

### 19.4 Backup & Recovery

- Automated daily backups
- Point-in-time recovery
- Backup verification
- Disaster recovery plan

---

## 20. Implementation Plan

### Phase 1: Foundation (Months 1–3)

| Deliverable |
|-------------|
| Project setup, database schema |
| Authentication and user management |
| Institution and course management |
| Student management module |
| Admin panel core UI |

### Phase 2: Academic Core (Months 4–6)

| Deliverable |
|-------------|
| Attendance management |
| Exam and marks management |
| Study materials module |
| Timetable management |
| Reports engine |
| Teacher portal |

### Phase 3: Communication Layer (Months 7–9)

| Deliverable |
|-------------|
| WhatsApp integration (primary) |
| SMS integration (fallback) |
| USSD integration (zero-data) |
| IVR voice integration (accessibility) |
| Email integration |
| Automated notification triggers |
| Message template management |
| Multi-channel broadcast system |

### Phase 4: Finance & Administration (Months 10–12)

| Deliverable |
|-------------|
| Fee management (multi-channel receipts) |
| Expense management |
| Payroll management |
| Financial reports |
| Library management |
| Certificate generation (TC, Bonafide, etc.) |
| Printed report templates |

### Phase 5: Mobile & Inclusive Access (Months 13–15)

| Deliverable |
|-------------|
| Parent mobile app (Android) |
| Parent mobile app (iOS) |
| Student PWA |
| USSD menu system |
| IVR result delivery |
| SMS-based result lookup |
| Low-bandwidth web optimization |
| Multi-language support |
| Kiosk mode for school labs |

### Phase 6: Polish & Launch (Months 16–18)

| Deliverable |
|-------------|
| Performance optimization |
| Security audit |
| UAT and bug fixes |
| Documentation |
| Training materials |
| Admin training sessions |
| Community access point setup |
| Production deployment |

---

## 21. Pricing Estimate

### Development Cost (One-Time)

| Phase | Effort | Cost Range |
|-------|--------|------------|
| Phase 1 — Foundation | 3 mo × 3 devs | $30,000 – $45,000 |
| Phase 2 — Academic Core | 3 mo × 3 devs | $30,000 – $45,000 |
| Phase 3 — Communication Layer | 3 mo × 2 devs | $20,000 – $30,000 |
| Phase 4 — Finance & Admin | 3 mo × 2 devs | $20,000 – $30,000 |
| Phase 5 — Mobile & Inclusive Access | 3 mo × 2 devs | $25,000 – $35,000 |
| Phase 6 — Polish & Launch | 3 mo × 2 devs | $15,000 – $20,000 |
| UI/UX Design | 2 mo × 1 designer | $8,000 – $12,000 |
| Project Management | 18 months | $15,000 – $25,000 |
| **Total** | | **$163,000 – $242,000** |

### Infrastructure Cost (Annual)

| Component | Annual Cost |
|-----------|-------------|
| Cloud / VPS Hosting | $3,000 – $8,000 |
| PostgreSQL + Redis | $1,500 – $4,000 |
| WhatsApp Business API | $500 – $2,000 |
| SMS Gateway (per message) | $500 – $3,000 (usage-based) |
| USSD Service | $300 – $1,000 |
| IVR Service | $300 – $1,000 |
| Email (SendGrid) | $300 – $1,000 |
| File Storage | $500 – $2,000 |
| SSL + Domain | $100 – $500 |
| Monitoring | $500 – $1,500 |
| **Total** | **$7,500 – $24,000** |

### Operational Cost (Annual)

| Component | Annual Cost |
|-----------|-------------|
| DevOps / System Admin | $12,000 – $24,000 |
| Support Team | $8,000 – $15,000 |
| Bug Fixes & Enhancements | $10,000 – $20,000 |
| **Total** | **$30,000 – $59,000** |

### Per-Institution SaaS Pricing

| Plan | Students | Monthly | Annual |
|------|----------|---------|--------|
| Starter | Up to 500 | ₹4,000 | ₹40,000 |
| Growth | 501 – 2,000 | ₹10,000 | ₹1,00,000 |
| Enterprise | 2,001 – 10,000 | ₹25,000 | ₹2,50,000 |
| Unlimited | 10,000+ | Custom | Custom |

*(SMS and WhatsApp costs passed through to institution based on usage)*

---

## 22. Roadmap

### Year 1 (Launch)
- All core modules operational
- WhatsApp + SMS + USSD live
- Parent app (iOS + Android)
- Printed report templates
- School lab kiosk mode

### Year 2 (Enhancement)
- AI-powered student performance prediction
- Video conferencing integration (virtual classes)
- Multi-language expansion
- Advanced analytics dashboard
- Community access point program
- Digital literacy training for parents

### Year 3+ (Scale)
- Blockchain certificates
- VR classroom modules
- Global curriculum support
- Third-party content marketplace
- Open API ecosystem
- NGO/government partnership programs for rural schools

---

## 23. Risk Assessment

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| WhatsApp API changes | High | Medium | SMS + USSD fallback always active |
| SMS delivery failures | Medium | Low | Multi-provider redundancy |
| USSD provider downtime | Medium | Low | Fallback to SMS |
| Low parent tech adoption | Medium | Medium | Training sessions, printed guides, school support |
| Data costs for parents | Medium | High | WhatsApp/SMS minimize data needs |
| Shared-device conflicts | Low | Medium | PIN profiles, kiosk mode |
| Performance at scale | High | Medium | Load testing, caching, optimization |
| Data loss | Critical | Low | Automated backups, redundancy |

---

## 24. Conclusion

The OmniLMS is designed for **maximum inclusivity**. It does not assume that every student or parent has a smartphone, data plan, or even a personal device. Instead, it builds a multi-channel communication and access system that ensures every piece of academic information reaches every family — through WhatsApp, SMS, USSD, IVR, printed reports, school computer labs, and community access points.

The admin panel provides complete control over courses, curricula, students, fees, and reports. The communication layer handles the heavy lifting of reaching every parent — automatically, reliably, and in their preferred format.

**Next Steps:**
1. Review and finalize requirements
2. Prioritize communication channels (WhatsApp → SMS → USSD)
3. Approve Phase 1 scope
4. Begin UI/UX design for admin and teacher panels
5. Setup development infrastructure

---

## Appendix

### A. Technology Details

| Technology | Version | Purpose |
|-----------|---------|---------|
| Node.js | 20 LTS | Backend runtime |
| React | 18 | Admin and teacher panels |
| TypeScript | 5.x | Type safety |
| PostgreSQL | 15+ | Primary database |
| Prisma | 5.x | ORM |
| Flutter | 3.x | Parent mobile app |
| Redis | 7.x | Cache and job queue |
| Nginx | Latest | Reverse proxy |
| Docker | Latest | Containerization |
| Baileys / Meta WA API | Latest | WhatsApp messaging |
| Twilio / MSG91 | Latest | SMS gateway |
| AfricasTalking / Exotel | Latest | USSD gateway |
| Twilio / Plivo | Latest | IVR voice calls |
| PDFKit | Latest | PDF generation |
| Puppeteer | Latest | Report rendering |

### B. Default Admin Setup

```
Admin Panel URL:  https://lms.schoolname.edu/admin
Setup: First-run wizard creates admin account
Default: No hardcoded credentials — security first
```

### C. Document Templates

- Transfer Certificate (TC)
- Bonafide Certificate
- Character Certificate
- Mark List / Progress Card
- Fee Receipt
- Salary Payslip
- Attendance Certificate
- No Due Certificate
- Migration Certificate
- Study Handout (chapter summary)

### D. Communication Provider Options

| Service | Provider | Best For |
|---------|----------|----------|
| WhatsApp | Meta Business API (official) | High-volume, reliable delivery |
| WhatsApp | Baileys (unofficial) | Low-cost, development/testing |
| SMS | Twilio | Global, reliable |
| SMS | MSG91 | India-focused, cost-effective |
| SMS | TextLocal | India-focused |
| USSD | AfricasTalking | Africa-first, global expansion |
| USSD | Exotel | India-focused |
| IVR | Twilio | Global |
| IVR | Plivo | Cost-effective |
| Email | SendGrid | High deliverability |
| Email | Nodemailer + SMTP | Self-hosted option |

### E. Multi-Language Support

| Language | USSD | SMS | IVR | Printed | App |
|----------|:----:|:---:|:---:|:-------:|:---:|
| English | ✓ | ✓ | ✓ | ✓ | ✓ |
| Malayalam | ✓ | ✓ | ✓ | ✓ | ✓ |
| Hindi | ✓ | ✓ | ✓ | ✓ | ✓ |
| Tamil | ✓ | ✓ | ✓ | ✓ | ✓ |
| Telugu | ✓ | ✓ | ✓ | ✓ | ✓ |
| Kannada | ✓ | ✓ | ✓ | ✓ | ✓ |

---

*This proposal is confidential and intended for internal review. All specifications are subject to refinement during the discovery and design phases.*
