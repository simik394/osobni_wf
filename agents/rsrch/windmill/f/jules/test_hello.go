package inner

import "fmt"

func main(name string) (interface{}, error) {
	return fmt.Sprintf("Hello %s", name), nil
}
