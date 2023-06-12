const express = require("express");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const cors = require("cors");
var jwt = require("jsonwebtoken");
require("dotenv").config();
const stripe = require("stripe")(process.env.PAYMENT_SK);
const port = process.env.PORT || 5000;

// middlewares
app.use(cors());
app.use(express.json());

// verify jwt
const verifyJwt = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res
      .status(401)
      .send({ error: true, message: "Unauthorized access" });
  }
  // bearer token
  const token = authorization.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
    if (err) {
      return res
        .status(403)
        .send({ error: true, message: "Unauthorized access" });
    }
    req.decoded = decoded;
    next();
  });
};

const uri = `mongodb+srv://${process.env.DB_NAME}:${process.env.DB_PASS}@cluster0.njyko.mongodb.net/?retryWrites=true&w=majority`;
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    // database collection
    const allUser = client.db("fluencyFusion").collection("users");
    const allCourse = client.db("fluencyFusion").collection("courses");
    const allEnrolledCourse = client
      .db("fluencyFusion")
      .collection("enrolledCourses");
    const allPurchasedCourse = client
      .db("fluencyFusion")
      .collection("purchasedCourse");
    const allPayment = client.db("fluencyFusion").collection("payments");

    // jwt token
    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    // verify admin middleware. Use this after verifyJWT
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await allUser.findOne(query);
      if (user?.role !== "admin") {
        return res
          .status(403)
          .send({ error: true, message: "Forbidded access" });
      }
      next();
    };

    // admin checking
    app.get("/users/admin/:email", verifyJwt, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        return res.send({ admin: false });
      }
      const query = { email: email };
      const user = await allUser.findOne(query);
      const result = { admin: user?.role === "admin" };
      res.send(result);
    });

    // instructor checking
    app.get("/users/instructor/:email", verifyJwt, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        return res.send({ instructor: false });
      }
      const query = { email: email };
      const user = await allUser.findOne(query);
      const result = { instructor: user?.role === "instructor" };
      res.send(result);
    });

    // users related api
    app.get("/users", verifyJwt, verifyAdmin, async (req, res) => {
      const result = await allUser.find().toArray();
      res.send(result);
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      // checking existing user or not
      const query = { email: user?.email };
      const existingUser = await allUser.findOne(query);
      if (existingUser) {
        return res.send({ message: "User already exist" });
      }
      const result = await allUser.insertOne(user);
      res.send(result);
    });

    app.delete("/users/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await allUser.deleteOne(query);
      res.send(result);
    });

    // make admin
    app.patch("/users/admin/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: "admin",
        },
      };
      const result = await allUser.updateOne(filter, updateDoc);
      res.send(result);
    });
    // make instructor
    app.patch("/users/instructor/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: "instructor",
        },
      };
      const result = await allUser.updateOne(filter, updateDoc);
      res.send(result);
    });

    // class/course related api
    app.get("/courses", async (req, res) => {
      const result = await allCourse.find().toArray();
      res.send(result);
    });

    app.get("/coursesByEmail", verifyJwt, async (req, res) => {
      const email = req.query.email;
      if (!email) {
        res.send([]);
      }
      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res
          .status(403)
          .send({ error: true, message: "Forbiddedn access" });
      }
      const query = { instructorEmail: email };
      const result = await allCourse.find(query).toArray();
      res.send(result);
    });

    app.post("/courses", async (req, res) => {
      const newClass = req.body;
      const result = await allCourse.insertOne(newClass);
      res.send(result);
    });

    app.patch("/courses/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: req.body,
      };
      const result = await allCourse.updateOne(filter, updateDoc);
      res.send(result);
    });
    // feedback to course
    app.patch("/courses/feedback/:id", async (req, res) => {
      const id = req?.params?.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          feedback: req?.body?.feedback,
        },
      };
      const result = await allCourse.updateOne(filter, updateDoc);
      res.send(result);
    });

    // make course approved
    app.patch("/courses/approve/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          status: "approved",
        },
      };
      const result = await allCourse.updateOne(filter, updateDoc);
      res.send(result);
    });
    // make course denied
    app.patch("/courses/denied/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          status: "denied",
        },
      };
      const result = await allCourse.updateOne(filter, updateDoc);
      res.send(result);
    });

    // all enrolledCorses related api -
    app.get("/enrolled", verifyJwt, async (req, res) => {
      const email = req?.query?.email;
      if (!email) {
        res.send([]);
      }
      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res
          .status(403)
          .send({ error: true, message: "Forbiddedn access" });
      }
      const query = { userEmail: email };
      const result = await allEnrolledCourse.find(query).toArray();
      res.send(result);
    });

    app.post("/enrolled", async (req, res) => {
      const newEnrolledCourse = req.body;
      const result = await allEnrolledCourse.insertOne(newEnrolledCourse);
      res.send(result);
    });

    app.delete("/enrolled/:id", async (req, res) => {
      const id = req.params.id;
      const result = await allEnrolledCourse.deleteOne({ _id: id });
      res.send(result);
    });

    //
    //
    //
    //
    // create payment intent
    app.post("/create-payment-intent", verifyJwt, async (req, res) => {
      const { price } = req.body;
      const amount = price * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    // payment related api
    app.post("/payments", verifyJwt, async (req, res) => {
      const payment = req.body;
      const result = await allPayment.insertOne(payment);

      // available seat decreased by 1
      const filter = { _id: payment?._id };
      const updateDoc = {
        $set: {
          availableSeats: payment?.availableSeats - 1,
        },
      };
      const updateResult = await allCourse.updateOne(filter, updateDoc);

      // insert into purchased course
      const insertResult = await allPurchasedCourse.insertOne(payment);

      // delete from enrolled course
      const deleteResult = await allEnrolledCourse.deleteOne({
        _id: payment._id,
      });
      res.send({ result });
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Fluency Fusion Running");
});

app.listen(port, (req, res) => {
  console.log(`Sever is running on port: ${port}`);
});
