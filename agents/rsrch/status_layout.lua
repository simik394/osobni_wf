local RSRCH = RSRCH

print("Hello from Lua! The configured port is: " .. tostring(RSRCH.port))

RSRCH.hooks.custom_status = function()
    -- Return a Promise-like object or execute async logic via interop
    -- For now, just return a table with some string values
    return {
        ["Lua Version"] = _VERSION,
        ["Custom Message"] = "Lua config is working successfully!"
    }
end

return {
    port = 9999,
    chromiumPort = 9223,
    headless = true
}
