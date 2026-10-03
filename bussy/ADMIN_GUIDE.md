# BUSSY admin guide

For Matthew, Sid and Rohan. Five jobs, in the order they usually happen.

## 1. Approve new people

Someone signs in with Google → they see *Waiting on an admin*.

1. **Users & settings → Access requests** (the sidebar badge shows how many are waiting).
2. Pick their **system**, then **Approve as member**. Their screen opens BUSSY by itself within a few seconds.
3. To let someone approve requests, set their **Role** to *Approver* under **Members**. *Admin* also gets ESL
   export, status overrides and settings. BUSSY won't let you remove the last admin.
4. **Remove access** moves someone to *Denied*; you can re-approve them later from the *Denied* list.

## 2. Approve or reject requests

1. **Approvals** lists everything *Pending review*, oldest first. Urgency-5 rows are highlighted.
2. Click a row to see every field, the purchase link and any receipt on the right.
3. A red **Possible duplicate of #N** banner means the same person submitted the same link (or same vendor and
   total within 24 hours). Check before approving — it never blocks anything on its own.
4. **Approve by TC/CE**, or **Reject** with a reason (the requester sees it on their request).
   Made a mistake? Hit **Undo** on the toast (works for 2 minutes).
5. To approve many at once, tick the boxes and click **Approve N selected**.

## 3. Export to ESL

1. **ESL export** lists every *Approved* request not yet sent, grouped by vendor, all ticked.
2. Untick anything you're holding back. Choose a layout: **one file grouped by vendor** (subtotal rows) or
   **one sheet per vendor**.
3. **Download .xlsx** (or .csv, or **Copy rows** to paste into an email). Downloading changes nothing.
4. After ESL has the file, click **Mark N as Submitted to ESL** and confirm. BUSSY saves the exact file under
   **Past batches** and moves those requests to the Package log.

Every request is one line. A cart is one line with quantity 1, the cart total and the cart link.

## 4. Check in packages

Anyone approved can do this — phones work fine.

1. **Package log → Quick check-in**: type the request number from the box, tap **Check in as {you}**.
2. BUSSY records the date and who checked it in and moves it to *Received*.
3. Wrong box? **Undo** works for 10 minutes for whoever checked it in, and any time for admins.
4. Orders waiting more than 21 days are highlighted — chase those with ESL.

## 5. Fix things

- **Raw data → Edit cells** (admins): fix text and numbers inline. Every edit is logged with old and new values on
  the request's timeline.
- **Open any request → Override status**: move it to any status with a note (logged). Use it for returns,
  cancellations, or orders ESL combined.
- **Vendors**: add aliases for alternate spellings, merge duplicates (requests move to the one you keep), and
  turn typed-in vendors into real ones.

## Start a new season

**Users & settings → Season → Start a new season**: name (`2027-28`), car label (`LHRd (27-28)`) and start date.
It becomes current, the form defaults to the new car, and the dashboard starts counting from week 0. Then fill in
**Budgets**. Old seasons stay in every season picker.

## Where the numbers come from

- **Committed spend** = Approved + Submitted to ESL + Received. Rejected and Returned/Canceled never count.
- **Totals** follow the form: item = quantity × unit cost (no tax or shipping); cart = cart total;
  Other = quantity × unit cost + shipping; reimbursement = amount entered.
- **Jkeys fees** = (1 − 1/(1 + fee %)) × committed Jkeys spend.
- **Projection** = straight line through the last 3 weekly points, carried 7 weeks forward.
- "Include reimbursements & other" on the dashboard is on by default; turn it off to match last year's workbook,
  which only counted purchase requests.
