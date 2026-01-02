const entities = require('@jetbrains/youtrack-scripting-api/entities');

exports.rule = entities.Issue.onChange({
    title: 'Log Changes',
    guard: (ctx) => {
        return true;
    },
    action: (ctx) => {
        console.log('Issue changed: ' + ctx.issue.id);
    },
    requirements: {}
});
