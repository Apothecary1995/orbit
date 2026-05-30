package main

import (
	"log"
	"net/http"
)

func main() {
	log.Println("Frontend → http://localhost:5173")
	log.Fatal(http.ListenAndServe(":5173", http.FileServer(http.Dir("."))))
}
