// Infrastruct/configs/workflows/safe-merge.js
// YouTrack Workflow to ensure safe merge practices

const entities = require('@jetbrains/youtrack-scripting-api/entities');

exports.rule = entities.Issue.onChange({
  title: 'Safe Merge',
  guard: (ctx) => {
    return ctx.issue.isReported && ctx.issue.fields.State.name === 'Fixed';
  },
  action: (ctx) => {
    const issue = ctx.issue;
    // Check if there is a linked PR and if it is merged
    // This is a placeholder as the actual PR status check usually requires external integration
    // or looking at fields populated by the integration.

    // For now, we just log or add a comment ensuring protocol
    console.log(`Issue ${issue.id} marked as Fixed. Ensuring protocol.`);
  },
  requirements: {
    State: {
      type: entities.State.fieldType,
      Fixed: {}
    }
  }
});
