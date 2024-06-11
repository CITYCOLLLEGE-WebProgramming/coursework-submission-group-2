const mongoose = require('mongoose');
const { Schema } = mongoose;

const connect = mongoose.connect("mongodb+srv://afountoukis:TVpPB5Me4Kue1ahc@Script-Jesters.harrvph.mongodb.net/");
// Check database connected or not
connect.then(() => {
    console.log("Database Connected Successfully");
})
.catch(() => {
    console.log("Database cannot be Connected");
})

// Create Schema
const Loginschema = new Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true
    },
    password: {
        type: String,
        required: true
    },
    surname: {
        type: String,
        default: ""
    },
    phoneNumber: {
        type: String,
        default: ""
    },
    gender: {
        type: String,
        default: ""
    },
    addresses: [{
        addressName: { type: String, required: true },
        street: { type: String, required: true },
        streetNumber: { type: String, required: true },
        postalCode: { type: String, required: true },
        city: { type: String, required: true },
        floor: { type: String, required: true },
        phonenumber: { type: String, required: true }
    }],
    cards: [{
        _id: { type: Schema.Types.ObjectId, default: () => new mongoose.Types.ObjectId() },
        cardNumber: { type: String, required: true },
        cardName: { type: String, required: true },
        expiryDate: { type: String, required: true },
        cvv: { type: String, required: true }
    }],
    favorites: [{
        type: Schema.Types.ObjectId,
        ref: 'products'
    }],
    purchaseHistory: [{
        products: [{
            productName: { type: String, required: true },
            quantity: { type: Number, required: true }
        }],
        totalAmount: { type: Number, required: true },
        addressName: { type: String, required: true },
        purchaseDate: { type: Date, default: Date.now }
    }],
    resetPasswordToken: String,
    resetPasswordExpires: Date
});

const CompanyLoginchema = new Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true
    },
    password: {
        type: String,
        required: true
    },
    SSN: {
        type: String,
        required: true
    },
    surname: {
        type: String,
        default: ""
    },
    phoneNumber: {
        type: String,
        default: ""
    },
    gender: {
        type: String,
        default: ""
    },
    soldProducts: [{
    productName: { type: String, required: true },
    quantity: { type: Number, required: true },
    totalAmount: { type: Number, required: true },
    purchaseDate: { type: Date, default: Date.now },
    buyerEmail: { type: String, required: true }
}],

    resetPasswordToken: String,
    resetPasswordExpires: Date
});

const ProductSchema = new Schema({
    ProductName: {
        type: String,
        required: true
    },
    Price: {
        type: Number,
        required: true
    },
    BarCode: {
        type: String,
        index: true,
        required: true
    },
    Quantity: {
        type: Number,
        required: true
    },
    Description: {
        type: String
    },
    Category: {
        type: String,
        enum: ['homeGarden', 'electronics', 'fashion', 'health', 'babyKid', 'books'],
        required: true
    },
    Image: {
        data: Buffer,
        contentType: String
    },
    companyName: {
        type: String,
        required: true
    }
});


// Collection part
const User = mongoose.model("users", Loginschema);
const Products = mongoose.model("products", ProductSchema);
const CompanyUser = mongoose.model("companyusers", CompanyLoginchema);

module.exports = { User, Products, CompanyUser };
