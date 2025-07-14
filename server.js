const express = require('express');
const sql = require('mssql');
const path = require('path');

const app = express();
const port = 3000;
const multer = require('multer');

app.use(express.json());

app.use(express.static(path.join(__dirname)));  // ✅ Serve static files

// Configure storage path and filename for uploaded files
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, 'images')); // Save in images folder
  },
  filename: function (req, file, cb) {
    const uniqueName = Date.now() + '-' + file.originalname;
    cb(null, uniqueName);
  }
});

const upload = multer({ storage: storage });

// SQL Server configuration
const config = {
  user: 'sa',
  password: '78792002CBb#',
  server: 'localhost',
  database: 'ministoreDB',
  options: {
    encrypt: false,
    trustServerCertificate: true
  }
};

// Serve static files from project root (HTML, CSS, JS)
app.use(express.static(path.join(__dirname)));

async function connectDB() {
  try {
    const pool = await sql.connect(config);
    console.log('✅ Connected to SQL Server');
    return pool;
  } catch (err) {
    console.error('❌ Database connection failed:', err.message);
  }
}

// API endpoint to get products by type
app.get('/api/products', async (req, res) => {
  const { typeId, filter, sort } = req.query;

  try {
    const db = await connectDB();

    let query = 'SELECT P_Name, Price, ImagePath FROM products WHERE PT_ID = @typeId';
    if (filter) {
      query += ' AND Price <= @filter';
    }
    if (sort === 'asc') {
      query += ' ORDER BY Price ASC';
    } else if (sort === 'desc') {
      query += ' ORDER BY Price DESC';
    }

    const request = db.request().input('typeId', sql.Int, typeId);

    if (filter) {
      request.input('filter', sql.Int, filter);
    }

    const result = await request.query(query);
    res.json(result.recordset);
  } catch (err) {
    console.error("Database error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST route to handle image upload and DB update
app.post('/api/upload', upload.single('image'), async (req, res) => {
  const { P_Name, Price, PT_ID } = req.body;
  const imagePath = req.file.filename; // Only the filename, not full path

  console.log("📥 Upload received:");
  console.log("  ➤ Product Name:", P_Name);
  console.log("  ➤ Price:", Price);
  console.log("  ➤ PT_ID:", PT_ID);
  console.log("  ➤ Image saved as:", imagePath);
  console.log("  ➤ Full path:", path.join(__dirname, 'images', imagePath));

  try {
    const db = await connectDB();

    await db.request()
      .input('P_Name', sql.NVarChar, P_Name)
      .input('Price', sql.Decimal(10, 2), Price)
      .input('PT_ID', sql.Int, PT_ID)
      .input('ImagePath', sql.NVarChar, imagePath)
      .query(`
        INSERT INTO products (P_Name, Price, PT_ID, ImagePath)
        VALUES (@P_Name, @Price, @PT_ID, @ImagePath)
      `);

    res.json({ message: '✅ Product uploaded successfully!' });
  } catch (err) {
    console.error("❌ Upload error:", err);
    res.status(500).json({ error: 'Failed to upload product' });
  }
});

//Delete route to remove a product
app.delete('/api/delete', async (req, res) => {
  const { P_Name } = req.body;

  try {
    const db = await connectDB();

    const result = await db.request()
      .input('P_Name', sql.NVarChar, P_Name)
      .query('DELETE FROM products WHERE P_Name = @P_Name');

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: "Product not found." });
    }

    res.json({ message: "🗑️ Product deleted successfully!" });
  } catch (err) {
    console.error("❌ Delete error:", err);
    res.status(500).json({ error: "Failed to delete product" });
  }
});

// Update route to modify product details
app.put('/api/update', async (req, res) => {
  const { old_P_Name, new_P_Name, new_Price, new_PT_ID } = req.body;

  try {
    const db = await connectDB();

    let updateFields = [];
    if (new_P_Name) updateFields.push(`P_Name = @new_P_Name`);
    if (new_Price) updateFields.push(`Price = @new_Price`);
    if (new_PT_ID) updateFields.push(`PT_ID = @new_PT_ID`);

    if (updateFields.length === 0) {
      return res.status(400).json({ error: "No fields provided for update." });
    }

    const query = `
      UPDATE products
      SET ${updateFields.join(", ")}
      WHERE P_Name = @old_P_Name
    `;

    const request = db.request().input("old_P_Name", sql.NVarChar, old_P_Name);
    if (new_P_Name) request.input("new_P_Name", sql.NVarChar, new_P_Name);
    if (new_Price) request.input("new_Price", sql.Decimal(10, 2), new_Price);
    if (new_PT_ID) request.input("new_PT_ID", sql.Int, new_PT_ID);

    const result = await request.query(query);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: "Product not found or nothing updated." });
    }

    res.json({ message: "✏️ Product updated successfully!" });
  } catch (err) {
    console.error("❌ Update error:", err);
    res.status(500).json({ error: "Failed to update product" });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/`);
});