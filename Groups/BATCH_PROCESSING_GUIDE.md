# Batch Processing Guide - For 5,000+ Groups

## 🎯 Overview

This version is specifically designed for **large organizations with 5,000+ groups**. It processes groups in batches and automatically saves progress between runs.

---

## 🚀 Quick Start

### Option 1: Manual Batch Processing (Recommended for First Run)

1. **Start the audit:**
   ```javascript
   auditGroupsWithoutOwners()
   ```

2. **The script will:**
   - Process 500 groups (default batch size)
   - Save progress automatically
   - Tell you how many groups remain

3. **Run again to continue:**
   ```javascript
   auditGroupsWithoutOwners()  // Automatically resumes where it left off
   ```

4. **Repeat until complete**
   - Each run processes another 500 groups
   - Progress is saved after each batch
   - Final report generated when complete

### Option 2: Automatic Batch Processing (Set It and Forget It)

1. **Create an automatic trigger:**
   ```javascript
   createAutoBatchTrigger()
   ```

2. **The script will:**
   - Run every 10 minutes automatically
   - Process 500 groups each time
   - Stop automatically when complete
   - Generate final report

3. **Stop automatic processing (if needed):**
   ```javascript
   deleteAutoBatchTrigger()
   ```

---

## 📊 Available Functions

### Main Functions

| Function | Purpose |
|----------|---------|
| `auditGroupsWithoutOwners()` | Start or continue the audit |
| `checkAuditProgress()` | View current progress without processing |
| `resetAudit()` | Clear all progress and start fresh |
| `createAutoBatchTrigger()` | Set up automatic processing every 10 minutes |
| `deleteAutoBatchTrigger()` | Stop automatic processing |

---

## ⚙️ Configuration

```javascript
const CONFIG = {
    BATCH_SIZE: 500,            // Groups per batch (adjust as needed)
    DELAY_BETWEEN_GROUPS: 100,  // Delay in milliseconds
    MAX_EXECUTION_TIME: 300,    // 5 minutes max per run
    
    SPREADSHEET_ID: '',         // Leave empty for new spreadsheet
    
    EMAIL_RECIPIENTS: 'admin@example.com',
    SEND_EMAIL: false,          // Set to true for email notifications
    EMAIL_ON_COMPLETE_ONLY: true // Only email when fully complete
};
```

### Adjusting Batch Size

| Groups | Recommended BATCH_SIZE | Runs Needed |
|--------|----------------------|-------------|
| 5,000 | 500 (default) | 10 runs |
| 10,000 | 500 | 20 runs |
| 20,000 | 500 | 40 runs |
| 5,000 | 1000 (faster) | 5 runs |

**Note:** Larger batch sizes = fewer runs, but higher risk of timeout

---

## 📈 Example Workflow for 10,000 Groups

### Manual Processing

```
Run 1:  auditGroupsWithoutOwners()
        → Processes groups 1-500
        → "Run this function again to continue"

Run 2:  auditGroupsWithoutOwners()
        → Processes groups 501-1000
        → "Run this function again to continue"

...

Run 20: auditGroupsWithoutOwners()
        → Processes groups 9501-10000
        → "AUDIT COMPLETE! Generating final report..."
        → Report URL displayed
```

### Automatic Processing

```
Step 1: createAutoBatchTrigger()
        → "Auto-batch trigger created!"

[Wait 10 minutes]
        → Automatically processes groups 1-500

[Wait 10 minutes]
        → Automatically processes groups 501-1000

...

[After ~3.5 hours for 10,000 groups]
        → Final report generated
        → Trigger automatically stops
```

---

## 🔍 Monitoring Progress

### Check Progress Anytime

```javascript
checkAuditProgress()
```

**Example Output:**
```
=== AUDIT PROGRESS ===
Status: In Progress
Processed: 3500/10000 groups (35.0%)
Groups with issues found: 287
Remaining: 6500 groups

Run auditGroupsWithoutOwners() to continue.
```

---

## 💾 How Progress is Saved

The script uses **Script Properties** to save:

1. **processedIndex** - Last group processed
2. **auditResults** - All groups with issues found so far
3. **groupsCache** - List of all groups (to avoid re-fetching)

**This means:**
- ✅ You can close the browser between runs
- ✅ Progress survives even if script times out
- ✅ You can run from different computers
- ✅ Safe to run multiple times

---

## ⏱️ Time Estimates

### For 10,000 Groups

**Manual Processing:**
- Batch size: 500 groups
- Time per batch: ~5 minutes
- Total runs needed: 20
- **Total time: ~100 minutes of active running**
- (Can be spread over days/weeks)

**Automatic Processing:**
- Runs every: 10 minutes
- Total runs needed: 20
- **Total time: ~3.5 hours (hands-off)**

### For 5,000 Groups

**Manual Processing:**
- Total runs needed: 10
- **Total time: ~50 minutes**

**Automatic Processing:**
- **Total time: ~1.75 hours (hands-off)**

---

## 🛡️ Safety Features

### 1. **Automatic Progress Saving**
- Progress saved after each batch
- Safe to stop and resume anytime

### 2. **Timeout Protection**
- Stops before 6-minute Apps Script limit
- Saves whatever was processed

### 3. **Caching**
- Groups list cached to avoid repeated API calls
- Faster subsequent runs

### 4. **Error Handling**
- Individual group errors don't stop the audit
- Errors logged but processing continues

---

## 🔧 Troubleshooting

### "How do I know if it's working?"

Check the logs after each run:
```
=== BATCH COMPLETE ===
Batch time: 287.3 seconds
Processed: 500/500 groups in this batch
Overall progress: 3500/10000 groups (35.0%)
Total groups with issues found so far: 287
```

### "I want to start over"

```javascript
resetAudit()
```

This clears all progress and lets you start fresh.

### "How do I speed it up?"

1. **Increase batch size:**
   ```javascript
   BATCH_SIZE: 1000  // Process 1000 groups per run
   ```

2. **Reduce delay:**
   ```javascript
   DELAY_BETWEEN_GROUPS: 50  // Faster, but riskier
   ```

3. **Use automatic processing:**
   ```javascript
   createAutoBatchTrigger()  // Runs every 10 minutes automatically
   ```

### "Can I run it during business hours?"

Yes! Each batch only takes ~5 minutes. You can:
- Run manually during breaks
- Schedule automatic runs during off-hours
- Spread processing over multiple days

---

## 📋 Best Practices

### 1. **First Run: Manual**
- Run manually first to verify permissions
- Check the first batch results
- Ensure everything works correctly

### 2. **Then: Automatic**
- Once verified, set up automatic trigger
- Let it run overnight or over weekend
- Check final report when complete

### 3. **Regular Audits**
- Schedule monthly audits
- Use same spreadsheet ID to track changes
- Compare results month-over-month

---

## 📊 Final Report

When complete, you'll get a spreadsheet with:

**Summary Section:**
```
GROUPS WITHOUT OWNERS/MANAGERS - AUDIT REPORT
Generated: 2025-12-19 00:45:00
Total Groups Scanned: 10,000
Groups with Issues: 847
No Owners: 423 | No Managers: 612 | Missing Both: 188
```

**Detailed Table:**
| Group Name | Group Email | Has Owner? | Has Manager? | Missing Roles |
|------------|-------------|------------|--------------|---------------|
| ... | ... | ... | ... | ... |

---

## ✅ Summary

**For 5,000+ Groups:**
1. Use the **Batch Processing** version
2. Start with `auditGroupsWithoutOwners()`
3. Run multiple times OR set up automatic trigger
4. Get final report when complete

**Advantages:**
- ✅ No timeout issues
- ✅ Can process unlimited groups
- ✅ Progress saved automatically
- ✅ Can run automatically
- ✅ Safe and reliable

---

*Last Updated: 2025-12-19*
