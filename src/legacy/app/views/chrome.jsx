export function renderHeader(title, subtitle, actionsHtml = '') {
  return `
    <div class="page-head">
      <div>
        <div class="eyebrow">SplitSmart</div>
        <h1>${title}</h1>
        ${subtitle ? `<p class="page-description">${subtitle}</p>` : ''}
      </div>
      ${actionsHtml ? `<div class="head-actions">${actionsHtml}</div>` : ''}
    </div>
  `;
}

export function renderWorkflow(activeStep) {
  const steps = [
    ['bill', '01', 'Bill'],
    ['assign', '02', 'Assign'],
    ['breakdown', '03', 'Review'],
    ['settlements', '04', 'Settle']
  ];
  const activeIndex = Math.max(0, steps.findIndex(([key]) => key === activeStep));
  return `<nav class="workflow-steps" aria-label="Bill workflow">
    <svg class="workflow-path" viewBox="0 0 1000 84" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path class="workflow-path-base" d="M80 32 C170 4 260 60 350 32 S560 4 650 32 S830 60 920 32"></path>
      <path class="workflow-path-progress" pathLength="1" style="--workflow-progress:${activeIndex / (steps.length - 1)}" d="M80 32 C170 4 260 60 350 32 S560 4 650 32 S830 60 920 32"></path>
      <path class="workflow-path-flow" pathLength="1" d="M80 32 C170 4 260 60 350 32 S560 4 650 32 S830 60 920 32"></path>
    </svg>
    <div class="workflow-nodes">${steps.map(([key, number, label], index) => `
    <button class="workflow-step ${index < activeIndex ? 'completed' : ''} ${key === activeStep ? 'active' : ''}" data-view="${key}" ${key === activeStep ? 'aria-current="step"' : ''}>
      <span>${number}</span><strong>${label}</strong>
    </button>
  `).join('')}</div></nav>`;
}
