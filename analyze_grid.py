from PIL import Image
import sys

def analyze_crossword(image_path):
    try:
        img = Image.open(image_path).convert('L')
    except Exception as e:
        print(f"Error opening image: {e}")
        return

    width, height = img.size
    pixels = img.load()

    # Simple thresholding
    threshold = 127
    
    # Attempt to find the grid. 
    # Since it's a 15x15 grid, we expect 16 lines.
    # We'll look for the first and last non-white pixels to estimate the grid boundaries.
    
    left, top, right, bottom = width, height, 0, 0
    for y in range(height):
        for x in range(width):
            if pixels[x, y] < threshold:
                left = min(left, x)
                top = min(top, y)
                right = max(right, x)
                bottom = max(bottom, y)
    
    if right <= left or bottom <= top:
        print("Could not detect grid boundaries.")
        return

    grid_width = right - left
    grid_height = bottom - top
    
    cell_w = grid_width / 15
    cell_h = grid_height / 15
    
    grid = []
    blocks = []
    
    for r in range(15):
        row_str = ""
        for c in range(15):
            # Sample the center of the cell
            cx = int(left + (c + 0.5) * cell_w)
            cy = int(top + (r + 0.5) * cell_h)
            
            # Use a small window around center to be robust
            dark_count = 0
            samples = 0
            for dx in range(-2, 3):
                for dy in range(-2, 3):
                    if 0 <= cx+dx < width and 0 <= cy+dy < height:
                        if pixels[cx+dx, cy+dy] < threshold:
                            dark_count += 1
                        samples += 1
            
            if dark_count > samples / 2:
                row_str += "#"
                blocks.append((r, c))
            else:
                row_str += "."
        grid.append(row_str)

    # Output grid pattern
    for row in grid:
        print(row)
    
    # Output block coordinates
    print("Blocks:", [f"{{{r},{c}}}" for r, c in blocks])
    
    # Across counts
    across_slots = []
    for r in range(15):
        row = grid[r]
        runs = row.split('#')
        counts = [len(run) for run in runs if len(run) >= 2]
        across_slots.append(counts)
    print("Across slots per row:", across_slots)
    
    # Down counts
    down_slots = []
    for c in range(15):
        col = "".join(grid[r][c] for r in range(15))
        runs = col.split('#')
        counts = [len(run) for run in runs if len(run) >= 2]
        down_slots.append(counts)
    print("Down slots per column:", down_slots)

analyze_crossword(r'C:\Users\eskan\AppData\Local\Temp\copilot-clipboard.png')
