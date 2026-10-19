# Project: Smart Team Task Management & Progress Tracking System

Act as a senior full-stack software engineer, UI/UX designer, database architect, and product designer. Build a complete, production-quality **Team Task Management and Accountability System** for internal company use.

Do not just create a static dashboard or UI mockup. Build a functional application with authentication, database persistence, task assignment, progress tracking, team management, notifications, and completion workflows.

First, inspect my existing project structure and technology stack. Reuse the existing architecture where appropriate instead of unnecessarily rebuilding everything. Do not rename existing project files, change project identity, or remove working features without a good reason.

## 1. Main Objective

I need a system where I can:

- Assign tasks to an individual employee.
- Assign tasks to an entire team.
- Assign one task to multiple selected employees.
- Set task priorities, descriptions, start dates, and deadlines.
- Require employees to report their progress.
- Receive updates when work is started, delayed, completed, or submitted for review.
- See the real-time status and progress of every task, team, and employee.
- Review submitted work and approve it or request changes.
- Identify overdue tasks, inactive tasks, and employees who need assistance.

The application should make it easy for a manager to answer:

1. What work have I assigned?
2. Who is responsible for each task?
3. What has been completed?
4. What is currently in progress?
5. Which tasks are overdue?
6. Who has not provided an update?
7. What work is waiting for my approval?
8. How productive are the teams over a selected period?

## 2. User Roles and Permissions

Implement role-based access control.

### A. Owner / Super Admin

The owner should have complete control over the system.

Permissions:
- Create, edit, archive, and delete tasks.
- Create teams and manage team membership.
- Invite employees and deactivate accounts.
- Assign tasks to individuals, teams, or multiple people.
- Set and change deadlines and priorities.
- View all teams, tasks, comments, and progress reports.
- Receive notifications for important task events.
- Review, approve, or reject submitted work.
- View employee and team performance analytics.
- Export reports.
- Configure task statuses and company settings.
- View an audit history of important actions.

### B. Manager / Team Lead

Permissions:
- View tasks assigned to their teams.
- Create and assign tasks within their authorized teams.
- Monitor individual employee progress.
- Review work if authorized.
- Request updates and revised deadlines.
- Comment on tasks and communicate with team members.
- View reports for their teams.

Managers should not be able to access unauthorized teams or change system-wide owner settings.

### C. Employee / Team Member

Permissions:
- View tasks assigned directly to them.
- View tasks assigned to their teams.
- Accept or acknowledge a task.
- Change their task status where permitted.
- Update the percentage of work completed.
- Submit progress reports and comments.
- Attach deliverables or provide links to completed work.
- Report blockers and request deadline extensions.
- Submit tasks for manager review.
- View their own task history and deadlines.

Employees must not be able to modify another employee's tasks, change their roles, approve their own submissions, or access unauthorized company information.

## 3. Task Creation and Assignment

Create a comprehensive task creation form with these fields:

- Task title
- Detailed description
- Task ID generated automatically
- Assigned team
- Assigned employee or multiple employees
- Assignment type: individual, multiple employees, or entire team
- Priority: Low, Normal, High, Urgent
- Start date
- Deadline with date and time
- Estimated effort or hours
- Task category or project
- Checklist and subtasks
- Relevant attachments and reference links
- Additional instructions
- Recurring schedule, if applicable
- Review required: Yes/No

### Assignment behavior

When I assign a task to a team:
- Every eligible team member should see the task.
- The task should be recorded as a team assignment.
- I should be able to designate one person as the primary owner.
- The task should not be marked complete merely because one member reports completing their portion.
- For tasks requiring individual accountability, track each assignee's status and progress separately.
- For shared tasks, provide a configurable completion rule, such as all required assignees must complete their work.

When assigning to an individual, that employee should receive a notification and see the task in their personal dashboard.

Prevent duplicate assignments and clearly display who is accountable for the final result.

## 4. Task Lifecycle and Completion Workflow

Implement the following task statuses:

1. Draft
2. Assigned
3. Acknowledged
4. In Progress
5. Blocked
6. Submitted for Review
7. Changes Requested
8. Completed
9. Cancelled

Expected workflow:

- Manager creates and assigns a task.
- Employee receives a notification.
- Employee acknowledges the assignment.
- Employee starts working and updates progress.
- Employee posts progress reports during the task.
- If a problem occurs, the employee marks the task as Blocked and explains why.
- When finished, the employee submits the task for review and provides a completion summary.
- The manager receives a review notification.
- The manager approves the task or requests changes with an explanation.
- Once approved, the task becomes Completed.

Record timestamps for assignment, acknowledgment, progress updates, submission, review, and final completion.

Only authorized users should be able to transition tasks into restricted states. If review is required, employees must not be able to mark their work as fully approved themselves.

## 5. Progress Tracking and Employee Updates

Progress tracking is a core feature.

Each task should show:
- Progress percentage from 0% to 100%.
- Current status.
- Last updated timestamp.
- Assigned employee or team.
- Deadline and remaining time.
- Whether the task is on track, at risk, overdue, or blocked.
- Number of comments and progress reports.
- Latest update from the assignee.

Provide a progress update form where employees can submit:

- Current completion percentage.
- Work completed since the last update.
- Work remaining.
- Problems or blockers.
- Help required from the manager.
- Expected completion date.
- Optional attachment or link.

Create a chronological progress timeline so the manager can see how the task developed over time.

Allow managers to request an update from an employee. Track whether the employee has responded and when the response was submitted.

Make it possible to configure update expectations, such as daily updates, weekly updates, or updates only when task status changes.

Do not invent progress percentages automatically. Calculate progress from completed subtasks when configured, or let authorized users update it manually.

## 6. Main Owner Dashboard

Build a professional command center for the company owner.

Display summary cards for:
- Total active tasks.
- Tasks completed this week.
- Tasks currently in progress.
- Overdue tasks.
- Blocked tasks.
- Tasks awaiting review.
- Tasks at risk.
- Employees who have not responded to update requests.

Include the following dashboard sections:

### My Assignments
Tasks I created, tasks assigned to me, and tasks requiring my action.

### Team Overview
A table showing each team, its active tasks, completed tasks, overdue tasks, and overall completion rate.

### Employee Overview
A searchable table showing:
- Employee name.
- Team.
- Assigned tasks.
- Active tasks.
- Completed tasks.
- Overdue tasks.
- Latest progress update.
- Pending responses.
- Current workload.

### Deadlines and Upcoming Work
Display tasks due today, tomorrow, this week, and later.

### Activity Feed
Show recent events, such as:
- A task was assigned.
- An employee acknowledged a task.
- Progress was updated.
- A task became overdue.
- A task was blocked.
- Work was submitted for review.
- A manager approved a task.

Provide filters by team, employee, priority, status, project, and date range.

## 7. Employee Dashboard

Every employee should have a personalized workspace.

Display:
- Tasks assigned to me.
- Tasks assigned to my teams.
- Tasks requiring acknowledgment.
- Tasks due today.
- Upcoming deadlines.
- Overdue tasks.
- Blocked tasks.
- Tasks awaiting review.
- Tasks returned for changes.
- My recent progress reports.

Make deadlines and required actions easy to understand.

Provide quick actions such as:
- Acknowledge task.
- Start task.
- Update progress.
- Report a blocker.
- Request deadline extension.
- Submit for review.

Employees should be able to see their own work history and understand what requires immediate attention.

## 8. Notifications and Reminders

Implement an in-app notification system.

Notify relevant users when:
- A new task is assigned.
- A task deadline changes.
- A task is approaching its deadline.
- A task becomes overdue.
- An employee acknowledges a task.
- An employee posts a progress report.
- An employee reports a blocker.
- An employee requests an extension.
- A task is submitted for review.
- A manager requests changes.
- A task is approved or rejected.

Provide configurable deadline reminders, such as 24 hours before a deadline and when the deadline passes.

For recurring reminders, avoid repeatedly notifying users unnecessarily. Add notification preferences and mark notifications as read or unread.

If email notifications are supported, implement them through a configurable email provider. Do not pretend emails have been sent if no provider is configured.

For scheduled reminders, use a reliable scheduled backend job or an equivalent mechanism supported by the existing deployment environment.

## 9. Teams and Organization Management

Build a team management section.

Features:
- Create, edit, and archive teams.
- Assign managers to teams.
- Add or remove employees.
- View team members and their workloads.
- Assign tasks to teams.
- View team task history and performance.
- Transfer tasks between teams with an audit record.
- Prevent inactive employees from receiving new assignments.

Support employees belonging to multiple teams where appropriate.

## 10. Comments, Files, and Communication

Every task should have a dedicated discussion area.

Include:
- Comments and threaded replies if practical.
- Progress update history.
- File attachments.
- Links to deliverables.
- Blocker reports.
- Deadline extension requests.
- Manager review feedback.
- System-generated activity events.

Keep communication connected to the task rather than scattered across unrelated pages.

Validate uploaded file types and sizes, enforce authorization for file access, and use secure storage rather than publicly exposing private attachments.

## 11. Reports and Analytics

Create a reporting section with date-range filters.

Reports should include:
- Tasks assigned versus completed.
- Task completion rates.
- On-time versus late completion.
- Average completion time.
- Overdue task count.
- Tasks awaiting review.
- Employee workload.
- Team workload.
- Progress update compliance.
- Tasks repeatedly returned for changes.
- Blockers and delay reasons.

Allow exports to CSV and, if practical, PDF.

Use transparent, clearly defined calculations. Do not present raw task counts as proof of employee productivity without context. Account for workload, task complexity, and shared assignments where possible.

## 12. UI/UX and Visual Design

Design the application as a premium, modern internal SaaS product.

Design direction:
- Clean, elegant, professional, technology-forward interface.
- Sidebar navigation on desktop.
- Responsive layouts for desktop, tablet, and mobile.
- Carefully designed typography and spacing.
- Consistent color palette with restrained use of accent colors.
- Attractive task cards and clear status indicators.
- Progress bars and meaningful charts.
- Smooth, subtle animations.
- Helpful empty states and loading skeletons.
- Toast notifications and confirmation dialogs.
- Searchable, sortable, filterable tables.
- Accessible forms and keyboard navigation.
- Light and dark mode if supported by the existing stack.

Suggested navigation:
1. Dashboard
2. All Tasks
3. My Tasks
4. Teams
5. Employees
6. Projects
7. Calendar
8. Reports
9. Notifications
10. Settings

Use a polished design inspired by modern productivity tools, but create an original interface rather than copying another product.

Prioritize clarity and usability over unnecessary animations or visual clutter.

## 13. Calendar and Deadline Management

Provide calendar views for:
- Daily tasks.
- Weekly deadlines.
- Monthly task schedules.

Allow authorized users to change deadlines, with appropriate confirmation and notifications.

Highlight overdue tasks and upcoming deadlines.

When a deadline changes, preserve the original deadline in the task history and record who made the change.

## 14. Database and Technical Requirements

Inspect the existing codebase before choosing or changing technologies.

Use the existing stack if it is suitable. If starting from scratch, select a maintainable full-stack architecture with:
- A modern TypeScript frontend.
- A secure backend/API.
- A relational database such as PostgreSQL.
- Authentication and role-based authorization.
- Database migrations and seed data.
- Secure file storage.
- Input validation and error handling.

Create appropriate database models or tables for:

- Users
- Roles and permissions
- Teams
- Team memberships
- Projects
- Tasks
- Task assignees
- Subtasks and checklists
- Progress updates
- Comments
- Attachments
- Task reviews
- Deadline extension requests
- Notifications
- Activity and audit logs
- User notification preferences

Use proper foreign keys, indexes, timestamps, and transaction handling where necessary.

A task and its assignees should be modeled separately so that one task can belong to multiple people without duplicating the task record.

Implement pagination for large lists, server-side filtering where appropriate, and consistent error responses.

Do not store important application data only in browser local storage.

## 15. Security and Reliability

Implement:
- Secure authentication.
- Password hashing if managing passwords directly.
- Server-side role and permission checks.
- Input validation.
- Protection against unauthorized record access.
- Secure session management.
- Rate limiting where appropriate.
- Safe file upload handling.
- Environment variables for secrets.
- Audit logging for sensitive actions.
- Proper handling of time zones and deadline comparisons.

Do not expose API keys, database credentials, private file URLs, or privileged operations to the frontend.

Do not trust a user's role, team membership, task assignment, or permissions just because the frontend sends those values.

## 16. Testing and Quality Assurance

Write and run tests for the most important workflows:

1. Owner creates a team and invites an employee.
2. Owner assigns a task to an individual.
3. Owner assigns a task to a team.
4. An employee acknowledges and starts a task.
5. An employee updates task progress.
6. An employee reports a blocker.
7. An employee submits work for review.
8. A manager requests changes.
9. An employee resubmits the task.
10. A manager approves the task.
11. The system identifies overdue tasks.
12. Unauthorized users cannot access or modify restricted tasks.
13. Notifications are created for the correct users.
14. Progress and analytics calculations are correct.

Fix errors rather than merely documenting them. Verify that the application builds successfully and that the main user workflows work end to end.

## 17. Implementation Instructions

Work in phases:

**Phase 1: Inspect and plan**
- Inspect the existing repository, framework, database, routes, components, and authentication.
- Identify reusable components and existing functionality.
- Present a concise implementation plan.
- Identify any external services that require configuration.

**Phase 2: Foundation**
- Implement the data model, migrations, authentication, permissions, and organization structure.

**Phase 3: Core functionality**
- Implement task creation, assignment, deadlines, individual progress, team assignments, comments, and completion reviews.

**Phase 4: Dashboards and notifications**
- Build the owner dashboard, employee dashboard, team views, reminders, and activity feed.

**Phase 5: Reports and polish**
- Add calendar, analytics, exports, responsive design, accessibility, and UI refinements.

**Phase 6: Verification**
- Run migrations, tests, linting, and production builds.
- Fix implementation errors.
- Document environment variables and setup instructions.
- Provide a clear summary of completed functionality and any remaining configuration.

You may work through these phases without waiting for approval after every step. If a decision depends on an external service or missing credential, build the appropriate integration boundary and document what must be configured.

## Final Requirements

- Build working features, not just placeholder screens.
- Connect all forms, buttons, filters, dashboards, and status transitions to real application logic.
- Use realistic seed data for development and demonstration.
- Keep the interface consistent across all pages.
- Avoid duplicate task records when assigning work to multiple employees.
- Preserve task history and progress reports.
- Make team accountability and deadline visibility the central priorities.
- Do not claim an integration, test, or workflow works unless you have verified it.
- Do not remove existing working functionality unnecessarily.

Start by inspecting my project and then implement the system in the existing repository. Prioritize a working end-to-end task assignment and progress tracking workflow before adding optional features.