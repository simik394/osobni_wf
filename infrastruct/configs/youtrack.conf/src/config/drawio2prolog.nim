import os, xmlparser, xmltree, streams, strtabs, strutils

proc escapeProlog(s: string): string =
  # Escape backslashes and single quotes for Prolog string safety
  result = s.replace("\\", "\\\\").replace("'", "\\'")

proc parseDrawio(filename: string) =
  let stream = newFileStream(filename, fmRead)
  if stream == nil:
    quit("Could not open file: " & filename, 1)
  
  let xml = parseXml(stream)
  
  proc traverse(node: XmlNode) =
    if node.kind == xnElement:
      if node.tag == "mxCell":
        let id = node.attr("id")
        let vertex = node.attr("vertex")
        let edge = node.attr("edge")
        let parent = node.attr("parent")
        
        # Skip root elements (id=0 and id=1) and ensure parent and id exist
        if id != "" and id != "0" and id != "1" and parent != "":
          if vertex == "1":
            let label = node.attr("value")
            let style = node.attr("style")
            echo "diagram_node('", escapeProlog(id), "', '", escapeProlog(style), "', '", escapeProlog(label), "', [])."
          elif edge == "1":
            let source = node.attr("source")
            let target = node.attr("target")
            let label = node.attr("value")
            let style = node.attr("style")
            echo "diagram_edge('", escapeProlog(id), "', '", escapeProlog(source), "', '", escapeProlog(target), "', '", escapeProlog(style), "', '", escapeProlog(label), "')."
            
      elif node.tag == "object":
        let id = node.attr("id")
        # In Draw.io, custom metadata properties wrap mxCell in an object element
        let cell = node.child("mxCell")
        if cell != nil:
          let style = cell.attr("style")
          let vertex = cell.attr("vertex")
          
          if vertex == "1":
            var metadataParts: seq[string] = @[]
            var label = ""
            
            if node.attrs != nil:
              for k, v in node.attrs.pairs:
                if k == "label":
                  label = v
                elif k != "id" and k != "placeholder":
                  metadataParts.add("'" & escapeProlog(k) & "'='" & escapeProlog(v) & "'")
            
            let metadataStr = "[" & metadataParts.join(", ") & "]"
            echo "diagram_node('", escapeProlog(id), "', '", escapeProlog(style), "', '", escapeProlog(label), "', ", metadataStr, ")."

      for child in node:
        traverse(child)

  traverse(xml)

if paramCount() < 1:
  quit("Usage: drawio2prolog <filename.drawio>", 1)

parseDrawio(paramStr(1))
