# Striker: Requirements Gathering v0.3

Nov 17, 2026 · @Someone

## Purpose

Striker is a free Chrome extension that helps job seekers reach company decision-makers. It imports contacts, researches each company from its public website, drafts personalized emails from the user's resume and sample email, and sends approved emails at a safe pace from the user's own Gmail, even with the browser closed.

**Design principle:** each user runs Striker on their own Google account and their own AI key. The developer runs no server and stores no user data.

**Labels:** Confirmed = explicitly requested. Proposed = recommended, still needs agreement. Deferred = planned for a later version.

## 1. Functional requirements

Functional requirements define what the user can do and what Striker must do, from setup through sending.

### 1.1 Setup and inputs

| ID | Requirement | Status | Description |
| --- | --- | --- | --- |
| FR01 | Setup wizard | Proposed | Guides the user to copy the Google Sheet + Apps Script template into their account, authorize it, connect its web-app link with a secret key, add an AI key or local model, and send a test email to themselves. |
| FR02 | Bring your own AI key | Proposed | User enters their own Gemini API key (v1 supports the Gemini free tier only), stored only in their browser. Free-tier rate limits are shown and handled. |
| FR03 | Import contacts | Confirmed | Accept a CSV with email addresses and, where available, names, companies, job titles, company websites and profile URLs. |
| FR04 | Validate and map columns | Proposed | Map columns, preview records, flag invalid formats, missing fields and duplicates with reasons. Format validity is not proof the mailbox exists. Never guess or generate email addresses. |
| FR05 | Extract the candidate profile | Confirmed | Extract skills, employment history, projects and achievements from a PDF or DOCX resume, inside the browser. |
| FR06 | Confirm extracted information | Proposed | Show the profile for correction. Emails use only the confirmed profile. |
| FR07 | Learn the email structure | Confirmed | Use the sample email's structure, tone, length, greeting, closing and call to action as drafting guidance. |
| FR08 | Set preferences | Proposed | Target role and seniority, opportunity type (advertised jobs, speculative outreach, or both), location eligibility, remote preference, availability, portfolio and resume links, email signature. |

### 1.2 Company and recipient research

| ID | Requirement | Status | Description |
| --- | --- | --- | --- |
| FR09 | Research companies | Confirmed | The built-in website reader fetches public company pages (homepage, About, Careers, engineering blog, product pages) and summarizes product, technology signals, engineering activity and openings. |
| FR10 | Research recipients | Confirmed | Use CSV profile URLs and public company pages to learn the recipient's role and public professional content. No inference of personality, private life or habits. |
| FR11 | Per-site permission requests | Proposed | Request access to a company's website only when researching that company. |
| FR12 | Respect source limits | Proposed | Use only publicly accessible pages. Never automate logged-in scraping of sites whose terms forbid it, such as LinkedIn. |
| FR13 | Verify the research target | Proposed | Match on company domain, name, role and profile URL. Hold ambiguous matches for review. |
| FR14 | Store research evidence | Proposed | Save source URLs, publication and retrieval dates, and notes. Label items confirmed, inferred or unknown. Distinguish current technology use from an old article or single job ad. |
| FR15 | Handle limited information | Proposed | When research is thin, draft conservatively from verified facts or mark for review. Reuse company research across contacts, with a refresh action. |

### 1.3 Matching and email generation

| ID | Requirement | Status | Description |
| --- | --- | --- | --- |
| FR16 | Connect experience to company needs | Confirmed | Connect the user's real skills and projects to relevant company information. Goal: a conversation about opportunities in the target role. |
| FR17 | Explain the match | Proposed | Show the company fact, supporting experience, recipient relevance, location fit and unknowns such as hiring status. Both advertised roles and speculative outreach are supported; speculative emails never claim the company is hiring. |
| FR18 | Produce and revise drafts | Proposed | Editable subject and plain-text body with one or two strong connections, a low-effort call to action and a polite opt-out line. Edit, regenerate, skip; manual edits preserved. |
| FR19 | Review before sending | Proposed | Show each draft with evidence, recipient and sender. Flag unsupported claims, placeholders, wrong names and generic or repeated content. Batch approval required before a campaign starts. |

### 1.4 Sending, pacing and outcomes

| ID | Requirement | Status | Description |
| --- | --- | --- | --- |
| FR20 | Continue without the browser | Confirmed | Sending runs in the user's own Google Apps Script with a Google Sheet as queue and history. Continues when the browser is closed. No central server. |
| FR21 | Campaign controls | Proposed | Start, pause, resume, cancel. After a pause is confirmed no new sends begin; an in-flight submission may finish. Sent emails appear in Gmail's Sent folder. |
| FR22 | Randomized send interval | Confirmed | Random wait between sends, 5–6 minutes by default and never less than 5 minutes, checked by a 1-minute timer. Applies per account across all campaigns; restarts after a resume. |
| FR23 | Daily cap and sending window | Proposed | Configurable daily limit (default 40/day, which is also the hard max, below the Apps Script quota of about 100/day). Weekday working hours in the recipient's time zone when known. Remainder carries over. |
| FR24 | Automatic protective pause | Proposed | Pause and alert on rate-limit or quota errors, revoked authorization, or a bounce threshold (e.g. 3+ bounces in the last 20 sends). |
| FR25 | Track status and recover failures | Proposed | Statuses: queued, scheduled, sending, sent, failed, skipped, uncertain. Failure reasons and retry controls. Sent means accepted by Google, not delivered to the inbox. |
| FR26 | Manage exclusions | Proposed | Do-not-contact list, prior-contact detection across imported lists, and flags for multiple contacts at one company. |
| FR27 | Record outcomes | Proposed | User marks replies, positive responses, interviews and opt-outs. Opt-outs join the exclusion list automatically. |
| FR28 | Reply detection and follow-ups | Deferred (v2) | Requires inbox read permission, which Google treats as restricted. |

## 2. Non-functional requirements

Non-functional requirements set the quality, safety and operating limits Striker must meet, each with an acceptance check where one applies.

### 2.1 Research and writing quality

| ID | Requirement | Description | Acceptance |
| --- | --- | --- | --- |
| NFR01 | Factual accuracy | Every company-specific statement traces to saved evidence; every candidate claim comes from the confirmed profile. | No unsupported claims in a pilot batch. |
| NFR02 | Identity and uncertainty | Unresolved identity mismatches block sending to that contact. Unknowns stay labeled unknown. | Ambiguous test records are held. |
| NFR03 | Appropriate personalization | Professional interests only, the user's own voice, no implied personal relationship. | User approves pilot drafts for relevance and tone. |
| NFR04 | Research freshness | Research older than an agreed interval is refreshed or clearly flagged before use. | Stale test research is flagged. |

### 2.2 Deliverability and account protection

| ID | Requirement | Description | Acceptance |
| --- | --- | --- | --- |
| NFR05 | Account-safe sending | Pacing, daily cap and sending window adjust only within safe limits (hard max 40/day, minimum 5-minute gap) and can't be turned off. | A pilot campaign never exceeds the cap or sends outside the window. |
| NFR06 | Email format | Plain text, no tracking pixels, no link shorteners, at most one or two links, resume attachments off by default. | Pilot emails pass a format check. |
| NFR07 | Gradual ramp-up | Default is 40/day. The setup wizard suggests a lower starting cap for new or rarely used Gmail accounts, raised only while bounce and opt-out rates stay low. | Cap increases follow the rule. |

### 2.3 Reliability

| ID | Requirement | Description | Acceptance |
| --- | --- | --- | --- |
| NFR08 | Durable progress | Save progress at every stage: research, drafting, approval, sending. | After an interruption, completed work is kept and pending work resumes. |
| NFR09 | Duplicate prevention | Never resend a confirmed send. Uncertain outcomes are checked against the Sent folder or held, never blindly retried. | Interruption tests produce no duplicate sends. |
| NFR10 | Independent execution | Sending works with the browser closed. | A pilot campaign continues after the browser closes. |
| NFR11 | Provider constraints | Respect Apps Script and Gmail quotas; bounded retries for temporary errors; clear permanent errors and recovery steps on revoked authorization. | Simulated quota and auth errors pause with clear guidance. |

### 2.4 Security, privacy and compliance

| ID | Requirement | Description | Acceptance |
| --- | --- | --- | --- |
| NFR12 | Account and data protection | Minimum permissions; Apps Script web app requires the setup secret; AI keys stored only in the browser; no keys or full email bodies in logs. | Requests without the secret are rejected. |
| NFR13 | No central data collection | The developer receives no resumes, contacts, drafts or keys. Any error reporting is anonymous and opt-in. | Network review shows no data sent to the developer. |
| NFR14 | Retention and deletion | Document what is stored in the browser and the user's Sheet, what goes to the AI provider, and how to delete it all. Keep only the minimum needed to honor opt-outs. | Delete-all removes user data. |
| NFR15 | Untrusted content | Fetched pages and uploaded files are data, not instructions; they can't change recipients, settings or sending controls. | Instruction-like text in a test page has no effect. |
| NFR16 | Legal basis | Truthful sender identity, an opt-out in every email, prompt opt-out handling, and only the personal data each email needs. | Every pilot email has an opt-out. |
| NFR17 | Abuse prevention | No setting allows unreviewed sending, sending above the cap, or removing the opt-out line. | Attempts to bypass are blocked. |

### 2.5 Store, usability and maintenance

| ID | Requirement | Description | Acceptance |
| --- | --- | --- | --- |
| NFR18 | Chrome Web Store compliance | Single purpose (job-search outreach), minimum permissions, published privacy policy, data-use disclosure, justification for each permission. | Passes store review. |
| NFR19 | Transparency | Open-source code, per-permission documentation, versioned Apps Script templates with an update path. | Docs cover every permission. |
| NFR20 | Setup usability | A non-expert completes setup in about 15 minutes or less. | Tested with 3–5 people other than the developer. |
| NFR21 | Clear controls | Visible progress, next scheduled send time, pause/cancel always reachable, understandable errors, keyboard access. | A tester runs a small campaign unaided. |
| NFR22 | Capacity and rate limits | CSV size targets set after a pilot. Drafting pauses and resumes when the Gemini free-tier limit is hit. One failed contact never fails the batch. | A forced failure affects only its contact. |
| NFR23 | Compatibility and maintainability | Confirmed Chrome version support; research, drafting and sending testable separately; diagnostic logs without unnecessary personal data. | Each component has its own tests. |

## 3. Success measures

Success is measured by qualified conversations, positive replies and interviews. Quality is tracked through bounce rate, opt-out rate, incorrect personalization and the share of drafts users rewrite.

## 4. Decisions

Decided on 17 November 2026:

- **Open source:** yes, published on GitHub.
- **AI provider in v1:** Gemini free tier only.
- **Opportunity type:** both advertised jobs and speculative outreach.
- **Fixed safety maximums:** 40 emails a day (also the default) and a random 5–6 minute gap between sends, never under 5 minutes. These replace the earlier 50/day and 4-minute values.
