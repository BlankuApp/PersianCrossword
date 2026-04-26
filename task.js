const grid = [[0,0,0,0,0,0,1,0,0,0,0,0,1,0,0],[0,0,0,1,0,0,0,0,0,1,0,0,0,0,0],[1,0,0,0,0,1,0,0,0,0,0,1,0,0,0],[0,0,1,0,0,0,0,0,1,0,0,0,0,1,0],[0,0,0,0,1,0,0,0,0,0,1,0,0,0,0],[0,1,0,0,0,0,1,0,0,0,0,0,1,0,0],[0,0,0,1,0,0,0,0,0,1,0,0,0,0,1],[0,0,0,0,0,1,0,0,0,1,0,0,0,0,0],[1,0,0,0,0,1,0,0,0,0,0,1,0,0,0],[0,0,1,0,0,0,0,0,1,0,0,0,0,1,0],[0,0,0,0,1,0,0,0,0,0,1,0,0,0,0],[0,1,0,0,0,0,1,0,0,0,0,0,1,0,0],[0,0,0,1,0,0,0,0,0,1,0,0,0,0,1],[0,0,0,0,0,1,0,0,0,0,0,1,0,0,0],[0,0,1,0,0,0,0,0,1,0,0,0,0,0,0]];

function getGroups(arr) {
    let groups = [];
    let current = 0;
    for (let val of arr) {
        if (val === 0) {
            current++;
        } else {
            if (current >= 2) groups.push(current);
            current = 0;
        }
    }
    if (current >= 2) groups.push(current);
    return groups;
}

console.log("1) Horizontal group counts by row (1-15):");
let emptyRows = [];
for (let i = 0; i < 15; i++) {
    let groups = getGroups(grid[i]);
    console.log(`Row ${i + 1}: ${groups.length}`);
    if (groups.length === 0) emptyRows.push(i + 1);
}

console.log("\n2) Vertical group counts by column (1-15, 1=rightmost):");
let emptyCols = [];
for (let j = 0; j < 15; j++) {
    let colIndex = 14 - j;
    let colData = [];
    for (let i = 0; i < 15; i++) colData.push(grid[i][colIndex]);
    let groups = getGroups(colData);
    console.log(`Col ${j + 1}: ${groups.length}`);
    if (groups.length === 0) emptyCols.push(j + 1);
}

console.log("\n3) Rows/Cols with no slots >= 2:");
console.log(`Rows: ${emptyRows.length ? emptyRows.join(", ") : "None"}`);
console.log(`Cols: ${emptyCols.length ? emptyCols.join(", ") : "None"}`);
