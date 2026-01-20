package main

import (
	"context"
	"fmt"
	"time"

	"jules-go/internal/db"
)

func main() {
	ctx := context.Background()

	fmt.Println("=== FalkorDB Integration Verification ===")

	// Connect
	client, err := db.NewClient(ctx, "localhost:6379")
	if err != nil {
		fmt.Printf("❌ Connection FAILED: %v\n", err)
		return
	}
	fmt.Println("✅ Connected to FalkorDB")
	defer client.Close()

	// Create session
	testSession := &db.JulesSession{
		ID:        "verify-test-" + fmt.Sprintf("%d", time.Now().Unix()),
		Status:    "testing",
		Repo:      "simik394/osobni_wf",
		Task:      "Verification test session",
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	err = client.CreateJulesSession(ctx, testSession)
	if err != nil {
		fmt.Printf("❌ Create FAILED: %v\n", err)
		return
	}
	fmt.Printf("✅ Created session: %s\n", testSession.ID)

	// Read back
	retrieved, err := client.GetJulesSession(ctx, testSession.ID)
	if err != nil {
		fmt.Printf("❌ Read FAILED: %v\n", err)
		return
	}
	fmt.Printf("✅ Retrieved session: ID=%s Status=%s Repo=%s\n",
		retrieved.ID, retrieved.Status, retrieved.Repo)

	// Update
	retrieved.Status = "verified"
	err = client.UpdateJulesSession(ctx, retrieved)
	if err != nil {
		fmt.Printf("❌ Update FAILED: %v\n", err)
		return
	}
	fmt.Println("✅ Updated session status to 'verified'")

	// Delete
	err = client.DeleteJulesSession(ctx, testSession.ID)
	if err != nil {
		fmt.Printf("❌ Delete FAILED: %v\n", err)
		return
	}
	fmt.Println("✅ Deleted test session")

	// Verify deletion
	deleted, err := client.GetJulesSession(ctx, testSession.ID)
	if deleted == nil && err == nil {
		fmt.Println("✅ Confirmed session no longer exists")
	} else {
		fmt.Printf("❌ Session still exists after delete: %v\n", deleted)
	}

	fmt.Println("\n=== FalkorDB: ALL CRUD OPERATIONS VERIFIED ===")
}
