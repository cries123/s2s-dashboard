import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc, collection, getDocs } from "firebase/firestore";
import * as fs from "fs";

// Read Firebase Config
const configPath = "./firebase-applet-config.json";
if (!fs.existsSync(configPath)) {
  console.error("Firebase config file not found!");
  process.exit(1);
}

const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));

// Initialize Firebase App
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

const dealerships = ["hyundai", "ford", "nissan"];

async function runMigration() {
  console.log("=== MONTHLY ARCHIVAL & RESET MIGRATION ===");
  
  // List all keys in path:
  const colRef = collection(db, "artifacts", "hyundai-sales-to-service", "public/data/performance");
  try {
    const listSnap = await getDocs(colRef);
    console.log(`Diagnostic: Found ${listSnap.size} documents in /performance`);
    listSnap.forEach(d => {
      console.log(` - Doc ID: ${d.id}`);
    });
  } catch (err: any) {
    console.error("Failed to list active collections:", err);
  }

  console.log("Saving June numbers (representing May results) to May 2026 Archive...");
  console.log("Starting active sheets fresh for June 1st...");

  for (const dealerId of dealerships) {
    console.log(`\nProcessing dealership: ${dealerId}`);

    // Part 1: Advisor Reports
    const activeAdvId = dealerId === "hyundai" ? "advisorReports" : `advisorReports_${dealerId}`;
    const archiveAdvId = dealerId === "hyundai" ? "advisorReports_archive_2026-05" : `advisorReports_${dealerId}_archive_2026-05`;

    const activeAdvRef = doc(db, "artifacts", "hyundai-sales-to-service", "public", "data", "performance", activeAdvId);
    const archiveAdvRef = doc(db, "artifacts", "hyundai-sales-to-service", "public", "data", "performance", archiveAdvId);

    const activeAdvSnap = await getDoc(activeAdvRef);
    if (activeAdvSnap.exists()) {
      const liveData = activeAdvSnap.data();
      console.log(`- Found active advisor data. Total Sales in active: ${liveData.totals?.totalSales || 0}`);
      
      // Copy to archive
      await setDoc(archiveAdvRef, {
        ...liveData,
        isArchive: true,
        archiveMonth: "2026-05",
        archivedAt: new Date()
      });
      console.log(`  Saved May archive: ${archiveAdvId}`);

      // Reset to June 1st baseline
      const initialAdvisors = [
        { name: "Frank", soCount: 0, hrsSold: 0, laborSold: 0, grossLabor: 0, partsSold: 0, grossParts: 0, totalSales: 0, gpPercent: 0, elr: 0, upsells: [] },
        { name: "Lemmy", soCount: 0, hrsSold: 0, laborSold: 0, grossLabor: 0, partsSold: 0, grossParts: 0, totalSales: 0, gpPercent: 0, elr: 0, upsells: [] },
        { name: "Jaryn", soCount: 0, hrsSold: 0, laborSold: 0, grossLabor: 0, partsSold: 0, grossParts: 0, totalSales: 0, gpPercent: 0, elr: 0, upsells: [] }
      ];
      await setDoc(activeAdvRef, {
        advisors: initialAdvisors,
        totals: {
          totalSales: 0,
          totalLabor: 0,
          totalGross: 0,
          totalParts: 0,
          totalGrossParts: 0,
          totalHrs: 0
        },
        reportStartDate: "2026-06-01",
        reportEndDate: "2026-06-30",
        updatedAt: new Date(),
        updatedBy: "System Migration Runner"
      });
      console.log(`  Reset active tracker to June 1st baseline: ${activeAdvId}`);
    } else {
      console.log(`- No active advisor data found for ${activeAdvId}. Skipping copy, initializing active document.`);
      // Initialize if active doesn't exist
      const initialAdvisors = [
        { name: "Frank", soCount: 0, hrsSold: 0, laborSold: 0, grossLabor: 0, partsSold: 0, grossParts: 0, totalSales: 0, gpPercent: 0, elr: 0, upsells: [] },
        { name: "Lemmy", soCount: 0, hrsSold: 0, laborSold: 0, grossLabor: 0, partsSold: 0, grossParts: 0, totalSales: 0, gpPercent: 0, elr: 0, upsells: [] },
        { name: "Jaryn", soCount: 0, hrsSold: 0, laborSold: 0, grossLabor: 0, partsSold: 0, grossParts: 0, totalSales: 0, gpPercent: 0, elr: 0, upsells: [] }
      ];
      await setDoc(activeAdvRef, {
        advisors: initialAdvisors,
        totals: {
          totalSales: 0,
          totalLabor: 0,
          totalGross: 0,
          totalParts: 0,
          totalGrossParts: 0,
          totalHrs: 0
        },
        reportStartDate: "2026-06-01",
        reportEndDate: "2026-06-30",
        updatedAt: new Date(),
        updatedBy: "System Migration Runner"
      });
    }

    // Part 2: Pot of Gold
    const activePoGId = dealerId === "hyundai" ? "potOfGold" : `potOfGold_${dealerId}`;
    const archivePoGId = dealerId === "hyundai" ? "potOfGold_archive_2026-05" : `potOfGold_${dealerId}_archive_2026-05`;

    const activePoGRef = doc(db, "artifacts", "hyundai-sales-to-service", "public", "data", "performance", activePoGId);
    const archivePoGRef = doc(db, "artifacts", "hyundai-sales-to-service", "public", "data", "performance", archivePoGId);

    const activePoGSnap = await getDoc(activePoGRef);
    if (activePoGSnap.exists()) {
      const livePoGData = activePoGSnap.data();
      console.log(`- Found active Pot of Gold data.`);
      
      // Copy to archive
      await setDoc(archivePoGRef, {
        ...livePoGData,
        isArchive: true,
        archiveMonth: "2026-05",
        archivedAt: new Date()
      });
      console.log(`  Saved May Pot of Gold archive: ${archivePoGId}`);

      // Reset Pot of Gold
      const clearedAdvData = (livePoGData.advData || []).map((row: any) => ({
        ...row,
        frank: 0,
        lemmy: 0
      }));
      const clearedTechData = (livePoGData.techData || []).map((row: any) => {
        const updatedRow = { ...row };
        Object.keys(updatedRow).forEach(key => {
          if (key !== "code" && key !== "desc") {
            updatedRow[key] = 0;
          }
        });
        return updatedRow;
      });

      await setDoc(activePoGRef, {
        ...livePoGData,
        advData: clearedAdvData,
        techData: clearedTechData,
        updatedAt: new Date(),
        updatedBy: "System Migration Runner"
      });
      console.log(`  Reset active Pot of Gold tracker: ${activePoGId}`);
    } else {
      console.log(`- No active Pot of Gold data found for ${activePoGId}.`);
    }

    // Part 3: Technician Efficiency
    const activeTechId = dealerId === "hyundai" ? "technicianReports" : `technicianReports_${dealerId}`;
    const archiveTechId = dealerId === "hyundai" ? "technicianReports_archive_2026-05" : `technicianReports_${dealerId}_archive_2026-05`;

    const activeTechRef = doc(db, "artifacts", "hyundai-sales-to-service", "public", "data", "performance", activeTechId);
    const archiveTechRef = doc(db, "artifacts", "hyundai-sales-to-service", "public", "data", "performance", archiveTechId);

    const activeTechSnap = await getDoc(activeTechRef);
    if (activeTechSnap.exists()) {
      const liveTechData = activeTechSnap.data();
      console.log(`- Found active Tech efficiency data. Technicians: ${liveTechData.technicians?.length || 0}`);

      // Copy to archive
      await setDoc(archiveTechRef, {
        ...liveTechData,
        isArchive: true,
        archiveMonth: "2026-05",
        archivedAt: new Date()
      });
      console.log(`  Saved May Tech archive: ${archiveTechId}`);

      // Reset active
      await setDoc(activeTechRef, {
        technicians: [],
        reportStartDate: "2026-06-01",
        reportEndDate: "2026-06-30",
        updatedAt: new Date(),
        updatedBy: "System Migration Runner"
      });
      console.log(`  Reset active Tech efficiency tracker: ${activeTechId}`);
    } else {
      console.log(`- No active Tech efficiency data found for ${activeTechId}. Skipping copy, initializing active document.`);
      await setDoc(activeTechRef, {
        technicians: [],
        reportStartDate: "2026-06-01",
        reportEndDate: "2026-06-30",
        updatedAt: new Date(),
        updatedBy: "System Migration Runner"
      });
    }
  }

  console.log("\n=== MIGRATION COMPLETE ===");
  process.exit(0);
}

runMigration().catch(err => {
  console.error("Migration error:", err);
  process.exit(1);
});
