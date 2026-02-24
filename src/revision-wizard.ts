import { input, confirm } from "@inquirer/prompts";

export async function collectRevisionProblems(): Promise<string[]> {
  const problems: string[] = [];
  let collecting = true;

  while (collecting) {
    const problem = await input({
      message: "Describe a problem (or press Enter to finish):",
    });

    if (problem.trim() === "") {
      if (problems.length === 0) {
        console.log("At least one problem is required");
      } else {
        collecting = false;
      }
    } else {
      problems.push(problem.trim());
    }
  }

  console.log("\nCollected problems:");
  for (let i = 0; i < problems.length; i++) {
    console.log(`  ${i + 1}. ${problems[i]}`);
  }
  console.log();

  const confirmed = await confirm({
    message: "Proceed with these problems?",
    default: true,
  });

  if (!confirmed) {
    console.log("Revision cancelled.");
    process.exit(0);
  }

  return problems;
}
