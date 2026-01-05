/**
 * Temporal Archive - Time Tracker JavaScript
 * Chart.js visualization with custom editorial styling
 */

let timelineChart = null;

/**
 * Custom Chart.js styling to match editorial aesthetic
 */
const chartConfig = {
  colors: {
    terracotta: '#C85A3A',
    terracottaDark: '#A64527',
    amber: '#D4965F',
    cream: '#FAF8F3',
    charcoal: '#2B2826',
    warmGray: '#8B827C',
    border: '#E8E2D8'
  },
  fonts: {
    display: "'Crimson Pro', Georgia, serif",
    body: "'IBM Plex Sans', -apple-system, sans-serif",
    mono: "'JetBrains Mono', 'Courier New', monospace"
  }
};

/**
 * Update timeline chart with hourly data
 * @param {string} projectFilter - Optional project ID to filter by
 */
async function updateTimelineChart(projectFilter = '') {
  try {
    const url = projectFilter
      ? `/api/timeline?project_id=${projectFilter}`
      : '/api/timeline';
    const response = await fetch(url);
    const data = await response.json();

    const ctx = document.getElementById('timeline-chart');
    if (!ctx) return;

    // Destroy existing chart
    if (timelineChart) {
      timelineChart.destroy();
    }

    // Prepare data - API returns 'hours' array with 'total_seconds'
    const labels = data.hours.map(h => h.hour);
    const values = data.hours.map(h => Math.round(h.total_seconds / 60));

    // Create gradient
    const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, chartConfig.colors.terracotta);
    gradient.addColorStop(1, chartConfig.colors.amber);

    // Create new chart with editorial styling
    timelineChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Active Time (minutes)',
          data: values,
          backgroundColor: gradient,
          borderColor: chartConfig.colors.terracotta,
          borderWidth: 0,
          borderRadius: 6,
          barPercentage: 0.7,
          categoryPercentage: 0.8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            backgroundColor: chartConfig.colors.charcoal,
            titleFont: {
              family: chartConfig.fonts.display,
              size: 14,
              weight: 600
            },
            bodyFont: {
              family: chartConfig.fonts.mono,
              size: 13
            },
            padding: 12,
            cornerRadius: 8,
            displayColors: false,
            callbacks: {
              title: function(context) {
                return context[0].label;
              },
              label: function(context) {
                const minutes = context.parsed.y;
                const hours = Math.floor(minutes / 60);
                const mins = minutes % 60;

                if (hours > 0) {
                  return `${hours}h ${mins}m active`;
                }
                return `${mins}m active`;
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: {
              color: chartConfig.colors.border,
              borderDash: [2, 4],
              drawBorder: false
            },
            ticks: {
              font: {
                family: chartConfig.fonts.mono,
                size: 11
              },
              color: chartConfig.colors.warmGray,
              padding: 8,
              callback: function(value) {
                return value + 'm';
              }
            },
            border: {
              display: false
            }
          },
          x: {
            grid: {
              display: false,
              drawBorder: false
            },
            ticks: {
              font: {
                family: chartConfig.fonts.mono,
                size: 11
              },
              color: chartConfig.colors.warmGray,
              maxRotation: 0,
              minRotation: 0,
              autoSkip: true,
              maxTicksLimit: 12
            },
            border: {
              display: false
            }
          }
        },
        animation: {
          duration: 800,
          easing: 'easeInOutQuart',
          delay: (context) => {
            let delay = 0;
            if (context.type === 'data' && context.mode === 'default') {
              delay = context.dataIndex * 30;
            }
            return delay;
          }
        },
        interaction: {
          intersect: false,
          mode: 'index'
        }
      }
    });

  } catch (error) {
    console.error('Error updating timeline chart:', error);
  }
}

/**
 * Format seconds to human-readable time
 */
function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

/**
 * Initialize on page load
 */
document.addEventListener('DOMContentLoaded', function() {
  // Timeline chart will be updated after summary loads
  // (triggered by HTMX afterSwap event in dashboard.html)

  // Add smooth scroll behavior
  document.documentElement.style.scrollBehavior = 'smooth';
});
