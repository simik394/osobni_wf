#include <X11/Xlib.h>
#include <X11/Xutil.h>
#include <X11/Xatom.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/*
 * Compile: gcc xmeta.c -lX11 -o xmeta
 */

int main() {
    Display *display = XOpenDisplay(NULL);
    if (!display) return 1;

    Window active_window;
    int revert_to;
    XGetInputFocus(display, &active_window, &revert_to);

    Window root = DefaultRootWindow(display);
    Window root_ret, parent_ret, *children;
    unsigned int nchildren;

    if (XQueryTree(display, root, &root_ret, &parent_ret, &children, &nchildren)) {
        printf("{\"windows\":[");
        int printed = 0;
        for (unsigned int i = 0; i < nchildren; i++) {
            XWindowAttributes attr;
            XGetWindowAttributes(display, children[i], &attr);
            if (attr.map_state == IsViewable && attr.width > 1 && attr.height > 1) {
                char *name = NULL;
                int is_utf8 = 0;
                
                // Try _NET_WM_NAME first (UTF-8)
                Atom net_wm_name = XInternAtom(display, "_NET_WM_NAME", False);
                Atom utf8_string = XInternAtom(display, "UTF8_STRING", False);
                Atom actual_type;
                int actual_format;
                unsigned long nitems, bytes_after;
                unsigned char *prop;
                
                if (XGetWindowProperty(display, children[i], net_wm_name, 0, 1024, False, utf8_string,
                                       &actual_type, &actual_format, &nitems, &bytes_after, &prop) == Success && prop) {
                    name = strdup((char *)prop);
                    is_utf8 = 1;
                    XFree(prop);
                } else {
                    XFetchName(display, children[i], &name);
                    is_utf8 = 0;
                }
                
                if (printed > 0) printf(",");
                printf("{\"id\":\"0x%lx\",\"x\":%d,\"y\":%d,\"w\":%d,\"h\":%d,\"active\":%s,\"title\":\"",
                       children[i], attr.x, attr.y, attr.width, attr.height,
                       (children[i] == active_window ? "true" : "false"));
                
                // Escape title for JSON
                if (name) {
                    for (char *c = name; *c; c++) {
                        if (*c == '"' || *c == '\\') printf("\\\\");
                        else if (*c == '\n') printf("\\n");
                        else if (*c == '\r') printf("\\r");
                        else if (*c == '\t') printf("\\t");
                        else if ((unsigned char)*c >= 32) printf("%c", *c);
                    }
                    if (is_utf8) free(name);
                    else XFree(name);
                } else {
                    printf("Unknown");
                }
                printf("\"}");
                printed++;
            }
        }
        printf("]}\n");
        XFree(children);
    }

    XCloseDisplay(display);
    return 0;
}
