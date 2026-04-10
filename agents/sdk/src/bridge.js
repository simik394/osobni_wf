"use strict";
const args = process.argv.slice(2);
const targetServer = args[0];
const action = args[1];
const remainingArgs = args.slice(2).join(' ');
console.log(`[MCP_BRIDGE_MOCK] Routing to server: ${targetServer}, action: ${action} with arguments: ${remainingArgs}`);
