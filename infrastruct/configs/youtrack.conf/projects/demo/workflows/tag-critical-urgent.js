const entities = require('@jetbrains/youtrack-scripting-api/entities');

/**
 * Auto-tag issues with "urgent" when Priority is set to Critical.
 * Also removes the tag if Priority changes away from Critical.
 */
exports.rule = entities.Issue.onChange({
    title: 'Tag Critical Issues as Urgent',
    guard: (ctx) => {
        const issue = ctx.issue;
        // Run when Priority field changes
        return issue.fields.isChanged(ctx.Priority);
    },
    action: (ctx) => {
        const issue = ctx.issue;
        const priority = issue.fields.Priority;

        if (priority && priority.name === 'Critical') {
            // Add urgent tag
            issue.addTag('urgent');
            console.log('Added urgent tag to ' + issue.id);
        } else {
            // Remove urgent tag if present
            const urgentTag = issue.tags.find(t => t.name === 'urgent');
            if (urgentTag) {
                issue.removeTag(urgentTag);
                console.log('Removed urgent tag from ' + issue.id);
            }
        }
    },
    requirements: {
        Priority: {
            type: entities.EnumField.fieldType,
            name: 'Priority'
        }
    }
});
