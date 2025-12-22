using Pkg
Pkg.Registry.update()
regs = Pkg.Registry.reachable_registries()
for reg in regs
    for (uuid, pkg) in reg
        if occursin("TreeSitter", pkg.name) || occursin("tree_sitter", pkg.name)
            println(pkg.name)
        end
    end
end
