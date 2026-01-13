diff --git a/src/routes/apiRoutes.js b/src/routes/apiRoutes.js
index 419a3789e5558b6561de490c8f884b498749154a..aee73788e5873a7fc5f0789b568f4caac890abb8 100644
--- a/src/routes/apiRoutes.js
+++ b/src/routes/apiRoutes.js
@@ -156,55 +156,60 @@ function buildProfileResponse(doc) {
     updatedAt: doc.updatedAt || doc.createdAt || null
   };
 }
 
 async function listParamResins() {
   const mongoReady = await ensureMongoReady();
   if (!mongoReady) {
     return {
       error: { status: 503, body: { success: false, error: "Banco de dados indisponivel" } }
     };
   }
 
   const db = getDb();
   const collections = await db
     .listCollections({ name: "parametros" })
     .toArray();
   if (collections.length === 0) {
     return { resins: [] };
   }
 
   const collection = getPrintParametersCollection();
   const resins = await collection
     .aggregate([
       {
         $group: {
-          _id: "$resinId",
-          name: { $first: "$resinName" },
+          _id: {
+            $ifNull: ["$resinId", { $ifNull: ["$resinName", "$name"] }]
+          },
+          name: {
+            $first: { $ifNull: ["$resinName", "$name"] }
+          },
           profiles: { $sum: 1 }
         }
       },
+      { $match: { name: { $ne: null } } },
       { $sort: { name: 1 } }
     ])
     .toArray();
 
   return { resins };
 }
 
 router.get("/params/resins", async (_req, res) => {
   try {
     const result = await listParamResins();
     if (result.error) {
       return res.status(result.error.status).json(result.error.body);
     }
 
     const resins = result.resins || [];
 
     res.json({
       success: true,
       resins: resins.map((item) => ({
         _id: item._id || item.name?.toLowerCase().replace(/\s+/g, "-"),
         name: item.name || "Sem nome",
         description: `Perfis: ${item.profiles ?? 0}`,
         profiles: item.profiles ?? 0,
         active: true
       }))
@@ -528,56 +533,58 @@ router.get("/gallery", async (req, res) => {
     
     const mongoReady = await ensureMongoReady();
     if (!mongoReady) {
       return res.status(503).json({
         success: false,
         error: "Banco de dados indisponivel"
       });
     }
     
     const galleryCollection = getGalleryCollection();
     const query = { status: "approved" };
     if (category) {
       query.category = category;
     }
     
     const skip = (parseInt(page) - 1) * parseInt(limit);
     const items = await galleryCollection
       .find(query)
       .sort({ createdAt: -1 })
       .skip(skip)
       .limit(parseInt(limit))
       .toArray();
     
     const total = await galleryCollection.countDocuments(query);
     
+    const totalPages = Math.ceil(total / parseInt(limit));
     res.json({
       success: true,
       items,
       total,
       page: parseInt(page),
-      totalPages: Math.ceil(total / parseInt(limit))
+      totalPages,
+      pages: totalPages
     });
   } catch (err) {
     console.error("[API] Erro ao listar galeria:", err);
     res.status(500).json({
       success: false,
       error: "Erro ao listar galeria"
     });
   }
 });
 
 // POST /gallery - Enviar item para galeria
 router.post("/gallery", async (req, res) => {
   try {
     const { name, email, title, description, imageUrl, category, resin, printer } = req.body;
     
     if (!name || !email || !imageUrl) {
       return res.status(400).json({
         success: false,
         error: "Nome, email e imagem sao obrigatorios"
       });
     }
