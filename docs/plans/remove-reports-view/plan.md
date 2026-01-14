# Remove Reports View - Implementation Plan

## Summary

Consolidate the Dashboard and Reports views by:
1. Enhancing Dashboard date navigation (day-by-day arrows, date display, Today button, date picker)
2. Removing the Reports view entirely
3. Updating navigation menu

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `server/views/dashboard.njk` | Modify | Update date navigation: day arrows, date format "Tue 14/1", Today button, date picker |
| `server/views/partials/header.njk` | Modify | Remove Reports link from navigation |
| `server/routes/pages.js` | Modify | Remove `/reports` route |
| `server/views/reports.njk` | Delete | Remove Reports view template |
| `public/css/style.css` | Modify | Add styles for Today button and date picker in dashboard nav |

## Implementation Steps

### Step 1: Update Dashboard Date Navigation (dashboard.njk)

**1.1 Update HTML structure** (lines 10-17)

Change from:
```html
<nav class="date-nav" id="date-nav">
    <button class="date-nav-arrow" id="prev-week" title="Previous week">&larr;</button>
    <div class="date-nav-tabs" id="date-tabs">
        <!-- Populated by JavaScript -->
    </div>
    <button class="date-nav-arrow" id="next-week" title="Next week">&rarr;</button>
</nav>
```

To:
```html
<nav class="date-nav" id="date-nav">
    <button class="date-nav-arrow" id="prev-day" title="Previous day">&larr;</button>
    <button class="date-nav-arrow" id="next-day" title="Next day">&rarr;</button>
    <div class="date-nav-tabs" id="date-tabs">
        <!-- Populated by JavaScript -->
    </div>
    <button class="date-nav-today" id="today-btn">Today</button>
    <input type="date" class="date-nav-picker" id="date-picker" title="Jump to date">
</nav>
```

**1.2 Update JavaScript state** (line 84)

Change:
```javascript
let weekOffset = 0;
```

To:
```javascript
let windowStartDate = new Date(); // Start of the 7-day window
```

**1.3 Update `getWeekDays` function** (lines 106-118)

Rename to `getWindowDays` and change to use a sliding window starting from `windowStartDate`:
```javascript
function getWindowDays() {
    const days = [];
    const start = new Date(windowStartDate);
    for (let i = 0; i < 7; i++) {
        const day = new Date(start);
        day.setDate(start.getDate() + i);
        days.push(day);
    }
    return days;
}
```

**1.4 Update `renderDateTabs` function** (lines 120-157)

- Change date format to "Tue 14/1" (keep "Today"/"Yesterday" for those days)
- Use new `getWindowDays()` function

```javascript
function renderDateTabs() {
    const container = document.getElementById('date-tabs');
    const days = getWindowDays();
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    let html = '';
    days.forEach((day) => {
        const dateStr = getDateString(day);
        const isActive = dateStr === getDateString(currentDate);
        const isTodayDate = isToday(day);
        const isYesterdayDate = isYesterday(day);

        let label;
        if (isTodayDate) {
            label = 'Today';
        } else if (isYesterdayDate) {
            label = 'Yesterday';
        } else {
            const dayName = dayNames[day.getDay()];
            const dayNum = day.getDate();
            const month = day.getMonth() + 1;
            label = `${dayName} ${dayNum}/${month}`;
        }

        const isFuture = day > new Date();

        html += `
            <button class="date-tab ${isActive ? 'active' : ''} ${isFuture ? 'future' : ''}"
                    data-date="${dateStr}"
                    ${isFuture ? 'disabled' : ''}>
                ${label}
            </button>
        `;
    });

    container.innerHTML = html;

    // Add click handlers
    container.querySelectorAll('.date-tab:not([disabled])').forEach(tab => {
        tab.addEventListener('click', () => {
            currentDate = new Date(tab.dataset.date + 'T00:00:00');
            renderDateTabs();
            loadAllData();
        });
    });
}
```

**1.5 Update arrow event listeners** (lines 159-169)

Change from week navigation to day navigation:
```javascript
document.getElementById('prev-day').addEventListener('click', () => {
    windowStartDate.setDate(windowStartDate.getDate() - 1);
    renderDateTabs();
});

document.getElementById('next-day').addEventListener('click', () => {
    const today = new Date();
    const windowEnd = new Date(windowStartDate);
    windowEnd.setDate(windowEnd.getDate() + 6);

    // Only allow if window end is before today
    if (windowEnd < today) {
        windowStartDate.setDate(windowStartDate.getDate() + 1);
        renderDateTabs();
    }
});
```

**1.6 Add Today button handler**

```javascript
document.getElementById('today-btn').addEventListener('click', () => {
    currentDate = new Date();
    // Reset window to show today
    windowStartDate = new Date();
    windowStartDate.setDate(windowStartDate.getDate() - 6); // Today at end of window
    renderDateTabs();
    loadAllData();
});
```

**1.7 Add date picker handler**

```javascript
document.getElementById('date-picker').addEventListener('change', (e) => {
    const selectedDate = new Date(e.target.value + 'T00:00:00');
    const today = new Date();

    if (selectedDate <= today) {
        currentDate = selectedDate;
        // Center window around selected date
        windowStartDate = new Date(selectedDate);
        windowStartDate.setDate(windowStartDate.getDate() - 3);
        renderDateTabs();
        loadAllData();
    }
});
```

**1.8 Update initialization** (lines 536-539)

Initialize `windowStartDate` to show today at the end of the window:
```javascript
// Initialize window to show today at the end
windowStartDate = new Date();
windowStartDate.setDate(windowStartDate.getDate() - 6);

renderDateTabs();
loadAllData();
```

### Step 2: Update Navigation Header (partials/header.njk)

Remove the Reports link from line 9:

Change:
```html
<nav class="main-nav">
    <a href="/" class="nav-link {% if activePage == 'dashboard' %}active{% endif %}">Dashboard</a>
    <a href="/reports" class="nav-link {% if activePage == 'reports' %}active{% endif %}">Reports</a>
    <a href="/projects" class="nav-link {% if activePage == 'projects' %}active{% endif %}">Projects</a>
    <a href="/settings" class="nav-link {% if activePage == 'settings' %}active{% endif %}">Settings</a>
</nav>
```

To:
```html
<nav class="main-nav">
    <a href="/" class="nav-link {% if activePage == 'dashboard' %}active{% endif %}">Dashboard</a>
    <a href="/projects" class="nav-link {% if activePage == 'projects' %}active{% endif %}">Projects</a>
    <a href="/settings" class="nav-link {% if activePage == 'settings' %}active{% endif %}">Settings</a>
</nav>
```

### Step 3: Remove Reports Route (pages.js)

Delete lines 24-31 (the `/reports` route):
```javascript
/**
 * Reports page
 */
router.get('/reports', (req, res) => {
  try {
    res.render('reports', { activePage: 'reports' });
  } catch (error) {
    console.error('Error rendering reports:', error);
    res.status(500).send('<h1>Error loading reports</h1>');
  }
});
```

### Step 4: Delete Reports View

Delete file: `server/views/reports.njk`

### Step 5: Add CSS Styles (style.css)

Add styles for the new Today button and date picker after the existing `.date-nav-arrow` styles (around line 1540):

```css
.date-nav-today {
  background: var(--color-sage);
  border: 1px solid var(--color-sage);
  border-radius: var(--radius-md);
  padding: 0.5rem 1rem;
  font-family: var(--font-body);
  font-size: 0.85rem;
  font-weight: 500;
  color: white;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-left: 0.5rem;
}

.date-nav-today:hover {
  background: var(--color-charcoal);
  border-color: var(--color-charcoal);
}

.date-nav-picker {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 0.4rem 0.5rem;
  font-family: var(--font-body);
  font-size: 0.85rem;
  color: var(--color-charcoal);
  cursor: pointer;
  margin-left: 0.5rem;
  width: auto;
}

.date-nav-picker:hover {
  border-color: var(--color-terracotta);
}

.date-nav-picker::-webkit-calendar-picker-indicator {
  cursor: pointer;
  opacity: 0.6;
}

.date-nav-picker::-webkit-calendar-picker-indicator:hover {
  opacity: 1;
}
```

## Testing Strategy

1. **Date Navigation**
   - Verify tabs show "Today", "Yesterday", then "Tue 14/1" format
   - Click left arrow: window shifts back 1 day
   - Click right arrow: window shifts forward 1 day (unless showing future)
   - Future dates should be disabled/grayed

2. **Today Button**
   - Click Today: jumps to current date
   - Window resets to show today at the end

3. **Date Picker**
   - Select a past date: jumps to that date
   - Window re-centers around selected date
   - Cannot select future dates

4. **Data Loading**
   - Changing dates loads correct data for all sections
   - Workday summary, project breakdown, timeline, detail tabs all update

5. **Navigation**
   - Reports link removed from header
   - Navigating to /reports returns 404 or redirects
   - Dashboard, Projects, Settings links work

6. **Responsive**
   - Test on mobile viewport
   - Date nav should wrap appropriately
