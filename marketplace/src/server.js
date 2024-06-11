const express = require("express");
const session = require("express-session");
const MongoStore = require('connect-mongo');
const path = require("path");
const mongoose = require("mongoose");
const bcrypt = require('bcrypt');
const multer = require('multer');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const fs = require('fs');
const { User, Products, CompanyUser } = require('./config');
const app = express();


// Function to mask the first 12 digits of card numbers
function maskCardNumber(cardNumber) {
    return '**** **** **** ' + cardNumber.slice(-4);
}

app.delete('/removeProduct/:id', async (req, res) => {
    try {
        const productId = req.params.id;
        await Products.findByIdAndDelete(productId);
        res.json({ success: true });
    } catch (error) {
        console.error('Error removing product:', error);
        res.json({ success: false });
    }
});


 // Function to get card type
function getCardType(cardNumber) {
    if (/^4/.test(cardNumber)) {
        return 'visa';
    } else if (/^(5[1-5]|222[1-9]|22[3-9]\d|2[3-6]\d{2}|27[01]\d|2720)/.test(cardNumber)) {
        return 'mastercard';
    }
    return 'unknown';
}

// Endpoint to fetch the image data
app.get('/productImage/:id', async (req, res) => {
    try {
        const product = await Products.findById(req.params.id);
        if (!product || !product.Image) {
            return res.status(404).send('Image not found');
        }
        res.set('Content-Type', product.Image.contentType);
        res.send(product.Image.data);
    } catch (error) {
        console.error('Error fetching image:', error);
        res.status(500).send('An error occurred while fetching the image.');
    }
});


// Load environment variables from .env file
require('dotenv').config();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure the transporter for sending emails
const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: 'scriptsellersyork@gmail.com', // Replace with your email
        pass: 'xvns lsgz rulo htkq'  // Replace with your email password
    }
});

// Clear session cart and destroy session on logout
app.get('/logout', (req, res) => {
    if (req.session) {
        req.session.cart = []; // Clear the cart
        req.session.destroy(err => {
            if (err) {
                console.error("Error logging out:", err);
                return res.status(500).send("An error occurred during logout.");
            }
            res.redirect('/login'); // Redirect to the login page after logout
        });
    } else {
        res.redirect('/login');
    }
});


transporter.verify((error, success) => {
    if (error) {
        console.log('Error configuring the transporter:', error);
    } else {
        console.log('Transporter is configured correctly:', success);
    }
});


// Set EJS as the templating engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.post('/requestPasswordReset', async (req, res) => {
    const { email } = req.body;

    try {
        // Check in User collection
        let user = await User.findOne({ email });
        let isCompanyUser = false;

        // If not found in User, check in CompanyUser
        if (!user) {
            user = await CompanyUser.findOne({ email });
            if (!user) {
                return res.json({ success: false, message: 'User not found.' });
            }
            isCompanyUser = true;
        }

        const token = crypto.randomBytes(20).toString('hex');
        const tokenExpiration = Date.now() + 3600000; // Token valid for 1 hour

        user.resetPasswordToken = token;
        user.resetPasswordExpires = tokenExpiration;
        await user.save();

        const mailOptions = {
            to: user.email,
            from: 'passwordreset@demo.com',
            subject: 'Password Reset',
            html: `
            <div style="
             background: #9053c7;
             background: -webkit-linear-gradient(-135deg, #c850c0, #4158d0);
             background: -o-linear-gradient(-135deg, #c850c0, #4158d0);
             background: -moz-linear-gradient(-135deg, #c850c0, #4158d0);
             background: linear-gradient(-135deg, #c850c0, #4158d0);
              padding: 20px;">
                 <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 10px; text-align: center;">
                     <img src="https://drive.google.com/uc?export=view&id=1URW-0blh80l0BdBm_RSC3lpjOEdSiMMx" alt="Logo" style="width: 50px; height: 50px; margin-bottom: 20px;">
                     <h2>Password Reset</h2>
                     <p>Seems like you forgot your password for Logo Inc. If this is true, click below to reset your password.</p>
                     <a href="http://${req.headers.host}/resetPassword?token=${token}&isCompanyUser=${isCompanyUser}" style="display: inline-block; padding: 10px 20px; font-size: 16px; color: #ffffff; background-color: #1a73e8; text-decoration: none; border-radius: 5px; margin-top: 20px;">Reset My Password</a>
                     <p style="margin-top: 20px;">If you did not forget your password you can safely ignore this email.</p>
                     <p style="font-size: 12px; color: #999999; margin-top: 20px;">ScriptSellers, Leontos Sofou-3, City College</p>
                     <p style="font-size: 12px; color: #999999;">Powered by HTMLemail.io</p>
                 </div>
             </div>`
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.log('Error sending email:', error);
                return res.status(500).json({ success: false, message: 'Error sending email' });
            } else {
                console.log('Email sent:', info.response);
                return res.json({ success: true, message: 'Password reset email sent.' });
            }
        });
    } catch (error) {
        console.error('Error during password reset request:', error);
        res.status(500).json({ success: false, message: 'An error occurred during the password reset request.' });
    }
});




// Endpoint to handle the password reset form submission
// Render Reset Password Page
// Render Reset Password Page
app.get('/resetPassword', async (req, res) => {
    const { token, isCompanyUser } = req.query;

    console.log('Token:', token);
    console.log('Is Company User:', isCompanyUser);

    try {
        const userModel = isCompanyUser === 'true' ? CompanyUser : User;
        const user = await userModel.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            console.log('Password reset token is invalid or has expired.');
            return res.status(400).send('Password reset token is invalid or has expired.');
        }

        res.render('resetPassword', { token, isCompanyUser });
    } catch (error) {
        console.error('Error rendering reset password page:', error);
        res.status(500).send('An error occurred.');
    }
});
app.post('/resetPassword', async (req, res) => {
    const { token, newPassword, isCompanyUser } = req.body;

    console.log('Reset Password Request Received:');
    console.log('Token:', token);
    console.log('Is Company User:', isCompanyUser);

    try {
        const userModel = isCompanyUser === 'true' ? CompanyUser : User;
        const user = await userModel.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            console.log('Password reset token is invalid or has expired.');
            return res.json({ success: false, message: 'Password reset token is invalid or has expired.' });
        }

        console.log('User found:', user);

        user.password = await bcrypt.hash(newPassword, 10);
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();

        console.log('Password reset successfully for user:', user);

        res.json({ success: true, message: 'Password has been reset.' });
    } catch (error) {
        console.error('Error resetting password:', error);
        res.status(500).json({ success: false, message: 'An error occurred. Please try again later.' });
    }
});






// Use EJS as the view engine
app.set("view engine", "ejs");
app.set('views', path.join(__dirname, 'views'));

// Convert data into JSON format
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static file
app.use(express.static("public"));

// Configure Session Middleware
app.use(session({
    secret: 'td10-kih&sjhhmy)q$@p2!55836omn!$v7t$k(j+f1b0p6=+j!',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: 'mongodb+srv://afountoukis:TVpPB5Me4Kue1ahc@Script-Jesters.harrvph.mongodb.net/',
        collectionName: 'sessions'
    }),
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 // 1 day
    }
}));

// Set up storage engine for Multer
const storage = multer.memoryStorage();

const upload = multer({
    storage: storage,
    limits: { fileSize: 1000000 }, // Limit file size to 1MB
    fileFilter: function (req, file, cb) {
        checkFileType(file, cb);
    }
}).single('productImage'); // Field name in the form



// Check file type
function checkFileType(file, cb) {
    const filetypes = /jpeg|jpg|png|gif/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);

    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb('Error: Images Only!');
    }
}


// Routes
app.post('/addToCart', async (req, res) => {
    if (!req.session.cart) {
        req.session.cart = [];
    }

    const productId = req.body.productId;
    const quantity = parseInt(req.body.quantity, 10);

    try {
        const product = await Products.findById(productId);
        if (product) {
            const cartItem = req.session.cart.find(item => item.product._id.toString() === productId);
            if (cartItem) {
                cartItem.quantity += quantity;
            } else {
                req.session.cart.push({ product, quantity });
            }
            res.sendStatus(204); // Send a 'No Content' status
        } else {
            res.status(404).json({ success: false, message: "Product not found" });
        }
    } catch (error) {
        console.error("Error adding to cart:", error);
        res.status(500).json({ success: false, message: "An error occurred while adding to the cart." });
    }
});

app.get('/cart', (req, res) => {
    console.log('Session Cart:', req.session.cart); // Log the session cart
    const cart = req.session.cart || [];
    const totalAmount = cart.reduce((total, item) => total + item.product.Price * item.quantity, 0);
    res.render('cart', { cart, totalAmount });
});


app.post('/checkout', (req, res) => {
    // Implement your checkout logic here
    req.session.cart = [];
    res.redirect('/cart');
});

// Function to generate HTML for the order email
function generateOrderEmail(order) {
    const productsList = order.products.map(product => `
        <tr>
            <td style="padding: 8px; border: 1px solid #ddd;">${product.productName}</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${product.quantity}</td>
        </tr>
    `).join('');

    return `
    <div style="
     background: #9053c7;
     background: -webkit-linear-gradient(-135deg, #c850c0, #4158d0);
     background: -o-linear-gradient(-135deg, #c850c0, #4158d0);
     background: -moz-linear-gradient(-135deg, #c850c0, #4158d0);
     background: linear-gradient(-135deg, #c850c0, #4158d0);
     padding:20px;">
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 10px;">
        <h2 style="text-align: center;">Order placed on ${order.purchaseDate.toLocaleDateString()}</h2>
        <p><strong>Address:</strong> ${order.addressName}</p>
        <table style="width: 100%; border-collapse: collapse;">
            <thead>
                <tr>
                    <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Product Name</th>
                    <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Quantity</th>
                </tr>
            </thead>
            <tbody>
                ${productsList}
            </tbody>
        </table>
        <p><strong>Total Amount:</strong> ${order.totalAmount}€</p>
    </div>
    </div>
    `;
}

app.post('/completePurchase', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    console.log('Request Body:', req.body);

    const products = Array.isArray(req.body.products) ? req.body.products : req.body.products ? [req.body.products] : [];
    const quantities = Array.isArray(req.body.quantities) ? req.body.quantities : req.body.quantities ? [req.body.quantities] : [];

    console.log('Products:', products);
    console.log('Quantities:', quantities);

    if (products.length === 0 || quantities.length === 0 || products.length !== quantities.length) {
        return res.status(400).send('Invalid request: products and quantities are required and must match in length');
    }

    const totalAmount = req.body.totalAmount;
    const addressName = req.body.addressName;

    const purchaseDetails = products.map((product, index) => ({
        productName: product,
        quantity: parseInt(quantities[index], 10)
    }));

    console.log('Purchase Details:', purchaseDetails);

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const user = await User.findById(req.session.user.id).session(session);
        if (!user) {
            await session.abortTransaction();
            return res.status(404).send('User not found');
        }

        const newOrder = {
            products: purchaseDetails,
            totalAmount: totalAmount,
            addressName: addressName,
            purchaseDate: new Date()
        };

        user.purchaseHistory = user.purchaseHistory || [];
        user.purchaseHistory.push(newOrder);

        for (let i = 0; i < products.length; i++) {
            const product = await Products.findOne({ ProductName: products[i] }).session(session);
            if (!product) {
                await session.abortTransaction();
                return res.status(404).send(`Product ${products[i]} not found`);
            }

            if (product.Quantity < purchaseDetails[i].quantity) {
                await session.abortTransaction();
                return res.status(400).send(`Not enough stock for product ${products[i]}`);
            }

            product.Quantity -= purchaseDetails[i].quantity;

            if (product.Quantity === 0) {
                await Products.deleteOne({ _id: product._id }).session(session);
            } else {
                await product.save({ session });
            }

            // Find the company user and update sold products
            const companyUser = await CompanyUser.findOne({ name: product.companyName }).session(session);
            if (companyUser) {
                const soldProduct = {
                    productName: products[i],
                    quantity: purchaseDetails[i].quantity,
                    totalAmount: (purchaseDetails[i].quantity * product.Price),
                    purchaseDate: new Date(),
                    buyerEmail: user.email
                };

                companyUser.soldProducts = companyUser.soldProducts || [];
                companyUser.soldProducts.push(soldProduct);
                await companyUser.save({ session });
            }
        }

        await user.save({ session });
        await session.commitTransaction();

        // Generate email content for the current order
        const emailContent = generateOrderEmail(newOrder);

        // Send order confirmation email
        const mailOptions = {
            to: user.email,
            from: 'orders@demo.com',
            subject: 'Order Confirmation',
            html: emailContent
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error('Error sending order confirmation email:', error);
            } else {
                console.log('Order confirmation email sent:', info.response);
            }
        });

        req.session.cart = []; // Clear the cart after purchase
        res.render('thankYou'); // Render the thank you page
    } catch (error) {
        console.error("Error completing purchase:", error);
        try {
            await session.abortTransaction();
        } catch (abortError) {
            console.error("Error aborting transaction:", abortError);
        }
        res.status(500).send("An error occurred while completing the purchase.");
    } finally {
        session.endSession();
    }
});

app.get('/soldProducts', async (req, res) => {
    if (!req.session.user || !req.session.user.SSN) {
        return res.redirect('/companyLogin');
    }

    res.render('soldProducts');
});

app.get('/soldProductsIframe', async (req, res) => {
    if (!req.session.user || !req.session.user.SSN) {
        return res.redirect('/companyLogin');
    }

    try {
        const companyUser = await CompanyUser.findById(req.session.user.id);
        if (!companyUser) {
            console.error('Company user not found');
            return res.status(404).send('Company user not found');
        }

        const totalAmount = companyUser.soldProducts.reduce((sum, product) => sum + product.totalAmount, 0);

        res.render('soldProductsIframe', { soldProducts: companyUser.soldProducts, totalAmount });
    } catch (error) {
        console.error('Error fetching sold products:', error);
        res.status(500).send('An error occurred while fetching sold products.');
    }
});



// Other routes...

app.get("/", (req, res) => {
    res.render("login");
});



app.get('/electronics', async (req, res) => {
    const searchTerm = req.query.search || '';
    console.log('Search Term:', searchTerm); // Log the search term
    try {
        let products;
        if (searchTerm) {
            products = await Products.find({
                ProductName: { $regex: searchTerm, $options: 'i' }
            });
        } else {
            products = await Products.find({ Category: "electronics" });
        }
        const user = req.session.user ? await User.findById(req.session.user.id).populate('favorites').exec() : null;
        const isCompanyUser = req.session.user && req.session.user.SSN ? true : false;
        res.render('electronics', { user, products, searchTerm: searchTerm, isCompanyUser });
    } catch (error) {
        console.error("Error fetching products:", error);
        res.status(500).send("An error occurred while fetching products.");
    }
});


app.get('/books', async (req, res) => {
    const searchTerm = req.query.search || '';
    console.log('Search Term:', searchTerm); // Log the search term
    try {
        let products;
        if (searchTerm) {
            products = await Products.find({
                ProductName: { $regex: searchTerm, $options: 'i' }
            });
        } else {
            products = await Products.find({ Category: "books" });
        }
        const user = req.session.user ? await User.findById(req.session.user.id).populate('favorites').exec() : null;
        const isCompanyUser = req.session.user && req.session.user.SSN ? true : false;
        res.render('books', { user, products, searchTerm: searchTerm, isCompanyUser });
    } catch (error) {
        console.error("Error fetching products:", error);
        res.status(500).send("An error occurred while fetching products.");
    }
});


// Route for Home Garden products
app.get("/homeGarden", async (req, res) => {
    try {
        const user = req.session.user ? await User.findById(req.session.user.id).exec() : null;
        const isCompanyUser = req.session.user && req.session.user.SSN ? true : false;
        const homeGardenProducts = await Products.find({ Category: 'homeGarden' });
        res.render("homeGarden", { user, isCompanyUser, products: homeGardenProducts });
    } catch (error) {
        console.error("Error fetching home garden products:", error);
        res.status(500).send("An error occurred while fetching home garden products.");
    }
});


// Route for Fashion products
app.get('/fashion', async (req, res) => {
    const searchTerm = req.query.search || '';
    console.log('Search Term:', searchTerm); // Log the search term
    try {
        let products;
        if (searchTerm) {
            products = await Products.find({
                ProductName: { $regex: searchTerm, $options: 'i' }
            });
        } else {
            products = await Products.find({ Category: "fashion" });
        }
        const user = req.session.user ? await User.findById(req.session.user.id).populate('favorites').exec() : null;
        const isCompanyUser = req.session.user && req.session.user.SSN ? true : false;
        res.render('fashion', { user, products, searchTerm: searchTerm, isCompanyUser });
    } catch (error) {
        console.error("Error fetching products:", error);
        res.status(500).send("An error occurred while fetching products.");
    }
});


// Route for Health products
app.get('/health', async (req, res) => {
    const searchTerm = req.query.search || '';
    console.log('Search Term:', searchTerm); // Log the search term
    try {
        let products;
        if (searchTerm) {
            products = await Products.find({
                ProductName: { $regex: searchTerm, $options: 'i' }
            });
        } else {
            products = await Products.find({ Category: "health" });
        }
        const user = req.session.user ? await User.findById(req.session.user.id).populate('favorites').exec() : null;
        const isCompanyUser = req.session.user && req.session.user.SSN ? true : false;
        res.render('health', { user, products, searchTerm: searchTerm, isCompanyUser });
    } catch (error) {
        console.error("Error fetching products:", error);
        res.status(500).send("An error occurred while fetching products.");
    }
});


// Route for Baby and Kid products
app.get('/babyKid', async (req, res) => {
    const searchTerm = req.query.search || '';
    console.log('Search Term:', searchTerm); // Log the search term
    try {
        let products;
        if (searchTerm) {
            products = await Products.find({
                ProductName: { $regex: searchTerm, $options: 'i' }
            });
        } else {
            products = await Products.find({ Category: "babyKid" });
        }
        const user = req.session.user ? await User.findById(req.session.user.id).populate('favorites').exec() : null;
        const isCompanyUser = req.session.user && req.session.user.SSN ? true : false;
        res.render('babyKid', { user, products, searchTerm: searchTerm, isCompanyUser });
    } catch (error) {
        console.error("Error fetching products:", error);
        res.status(500).send("An error occurred while fetching products.");
    }
});


app.get('/api/products', async (req, res) => {
    const searchTerm = req.query.search || '';
    try {
        const filteredProducts = await Products.find({
            ProductName: { $regex: searchTerm, $options: 'i' }
        }).select('ProductName Price BarCode Quantity Description Category Image');

        res.json(filteredProducts);
    } catch (error) {
        console.error("Error fetching filtered products:", error);
        res.status(500).send("An error occurred while fetching filtered products.");
    }
});

app.get('/HomePage', async (req, res) => {
    const searchTerm = req.query.search || '';
    console.log('Search Term:', searchTerm); // Log the search term
    try {
        let products;
        if (searchTerm) {
            products = await Products.find({
                ProductName: { $regex: searchTerm, $options: 'i' }
            });
        } else {
            products = await Products.find();
        }
        const user = req.session.user ? await User.findById(req.session.user.id).populate('favorites').exec() : null;
        const isCompanyUser = req.session.user && req.session.user.SSN ? true : false;
        res.render('HomePage', { user, products, searchTerm, isCompanyUser });
    } catch (error) {
        console.error("Error fetching products:", error);
        res.status(500).send("An error occurred while fetching products.");
    }
});


app.post('/deleteCard', async (req, res) => {
    if (!req.session.user) {
        return res.json({ success: false, message: 'User not logged in' });
    }

    const userId = req.session.user.id;
    const cardId = req.body.cardId;

    try {
        const result = await User.updateOne(
            { _id: userId },
            { $pull: { cards: { _id: cardId } } }
        );

        if (result.modifiedCount === 0) {
            return res.json({ success: false, message: 'Card not found or not deleted' });
        }

        req.session.user.cards = req.session.user.cards.filter(card => card._id.toString() !== cardId);

        res.json({ success: true });
    } catch (error) {
        console.error("Error deleting card:", error);
        res.json({ success: false, message: 'Error deleting card' });
    }
});

app.post('/updateAddress', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    const userId = req.session.user.id;
    const index = req.body.index - 1; // Adjust for zero-based index
    const updatedAddress = {
        addressName: req.body.addressName,
        street: req.body.street,
        streetNumber: req.body.streetNumber,
        postalCode: req.body.postalCode,
        city: req.body.city,
        floor: req.body.floor,
        phonenumber: req.body.phonenumber
    };

    try {
        const user = await User.findById(userId);
        if (user && user.addresses[index]) {
            user.addresses[index] = updatedAddress;
            await user.save();
            req.session.user.addresses = user.addresses; // Update session data
            res.redirect('/userProfile');
        } else {
            res.status(404).send('Address not found');
        }
    } catch (error) {
        console.error("Error updating address:", error);
        res.status(500).send("An error occurred while updating the address.");
    }
});

// Route to toggle favorite product
app.post('/toggleFavorite', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, message: 'User not logged in' });
    }

    const userId = req.session.user.id;
    const { productId, isChecked } = req.body;

    try {
        const user = await User.findById(userId);

        if (isChecked) {
            // Add to favorites if not already present
            if (!user.favorites.includes(productId)) {
                user.favorites.push(productId);
            }
        } else {
            // Remove from favorites
            user.favorites = user.favorites.filter(id => id.toString() !== productId);
        }

        await user.save();
        req.session.user.favorites = user.favorites; // Update session data

        res.json({ success: true });
    } catch (error) {
        console.error('Error updating favorites:', error);
        res.status(500).json({ success: false, message: 'An error occurred while updating favorites.' });
    }
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/userProfile', (req, res) => {
    if (req.session.user) {
        res.render('userProfile', { user: req.session.user });
    } else {
        res.redirect('/');
    }
});
app.post('/removeFromCart', async (req, res) => {
    if (!req.session.cart) {
        return res.status(400).json({ success: false, message: 'Cart is empty' });
    }

    const productId = req.body.productId;

    try {
        req.session.cart = req.session.cart.filter(item => item.product._id.toString() !== productId);
        res.redirect('/cart');  // Redirect to the cart page after removal
    } catch (error) {
        console.error("Error removing from cart:", error);
        res.status(500).send('An error occurred while removing the product from the cart.');
    }
});


app.get('/userFavorite', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/');
    }

    try {
        const user = await User.findById(req.session.user.id).populate('favorites').exec();
        res.render('userFavorite', { user: req.session.user, favorites: user.favorites });
    } catch (error) {
        console.error("Error fetching favorite products:", error);
        res.status(500).send("An error occurred while fetching favorite products.");
    }
});

app.get('/userHelp', async (req, res) => {
    const user = req.session.user ? await User.findById(req.session.user.id).exec() : null;
    const isCompanyUser = req.session.user && req.session.user.SSN ? true : false;
    res.render('userHelp', { user, isCompanyUser });
});


app.get('/aboutUs', async (req, res) => {
    const user = req.session.user ? await User.findById(req.session.user.id).exec() : null;
    const isCompanyUser = req.session.user && req.session.user.SSN ? true : false;
    res.render('aboutUs', { user, isCompanyUser });
});

app.get('/userOrderHistory', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    User.findById(req.session.user.id)
        .then(user => {
            if (!user) {
                return res.status(404).send('User not found');
            }
            res.render('userOrderHistory', { user });
        })
        .catch(error => {
            console.error('Error fetching user order history:', error);
            res.status(500).send('An error occurred while fetching order history.');
        });
});

app.get('/userWallet', (req, res) => {
    if (req.session.user) {
        res.render('userWallet', { user: req.session.user });
    } else {
        res.redirect('/');
    }
});

app.get('/productInformation', async (req, res) => {
    try {
        const user = req.session.user ? await User.findById(req.session.user.id).exec() : null;
        const isCompanyUser = req.session.user && req.session.user.SSN ? true : false;
        const productId = req.query.id;
        const product = await Products.findById(productId);

        if (!product) {
            return res.status(404).send("Product not found");
        }

        const companyUser = await CompanyUser.findOne({ name: product.companyName });
        const companyName = companyUser ? companyUser.name : 'Unknown Company';

        res.render('productInformation', { user, isCompanyUser, product, companyName });
    } catch (error) {
        console.error("Error fetching product information:", error);
        res.status(500).send("An error occurred while fetching product information.");
    }
});

app.get('/sellingProducts', async (req, res) => {
    if (!req.session.user || !req.session.user.SSN) {
        return res.redirect('/companyLogin');
    }

    try {
        const products = await Products.find({ companyName: req.session.user.name });
        res.render('sellingProducts', { products });
    } catch (error) {
        console.error('Error fetching selling products:', error);
        res.status(500).send('An error occurred while fetching the products.');
    }
});

app.get('/sellingProductsIframe', async (req, res) => {
    if (!req.session.user || !req.session.user.SSN) {
        return res.redirect('/companyLogin');
    }

    try {
        const products = await Products.find({ companyName: req.session.user.name });
        res.render('sellingProductsIframe', { products });
    } catch (error) {
        console.error('Error fetching selling products:', error);
        res.status(500).send('An error occurred while fetching the products.');
    }
});



app.get('/orderHistoryText', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    User.findById(req.session.user.id)
        .then(user => {
            if (!user) {
                return res.status(404).send('User not found');
            }
            res.render('orderHistoryText', { user });
        })
        .catch(error => {
            console.error('Error fetching user order history:', error);
            res.status(500).send('An error occurred while fetching order history.');
        });
});

app.post("/changePass", async (req, res) => {
    const { currentPassword, newPassword, confirmNewPassword } = req.body;

    if (newPassword !== confirmNewPassword) {
        return res.json({ success: false, message: "New passwords do not match." });
    }

    try {
        // Determine if the user is a company user or a regular user
        const userModel = req.session.user.SSN ? CompanyUser : User;
        const user = await userModel.findById(req.session.user.id);

        if (!user) {
            return res.json({ success: false, message: "User not found." });
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.json({ success: false, message: "Current password is incorrect." });
        }

        const hashedNewPassword = await bcrypt.hash(newPassword, 10);
        user.password = hashedNewPassword;
        await user.save();

        // Redirect based on user type
        const redirectUrl = req.session.user.SSN ? "/companyProfile" : "/userProfile";
        return res.json({ success: true, message: "Password successfully changed.", redirect: redirectUrl });
    } catch (error) {
        console.error("Error changing password:", error);
        return res.json({ success: false, message: "An error occurred while changing the password." });
    }
});



app.post('/deleteAddress', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, message: 'User not logged in' });
    }

    const userId = req.session.user.id;
    const addressId = req.body.addressId;

    try {
        const result = await User.updateOne(
            { _id: userId },
            { $pull: { addresses: { _id: addressId } } }
        );

        if (result.modifiedCount === 0) {
            return res.status(404).json({ success: false, message: 'Address not found or not deleted' });
        }

        req.session.user.addresses = req.session.user.addresses.filter(address => address._id.toString() !== addressId);

        res.json({ success: true });
    } catch (error) {
        console.error("Error deleting address:", error);
        res.status(500).json({ success: false, message: 'Error deleting address' });
    }
});

app.get("/changePass", (req, res) => {
    if (req.session.user) {
        res.render("changePass");
    } else {
        res.redirect('/login');
    }
});

app.get("/electronics", (req, res) => {
    res.render("electronics");
});

app.get("/homeGarden", (req, res) => {
    res.render("homeGarden");
});

app.get("/fashion", (req, res) => {
    res.render("fashion");
});

app.get("/health", (req, res) => {
    res.render("health");
});

app.get("/babyKid", (req, res) => {
    res.render("babyKid");
});

app.get("/books", (req, res) => {
    res.render("books");
});


app.get('/helpCenter', async (req, res) => {
    const user = req.session.user ? await User.findById(req.session.user.id).exec() : null;
    const isCompanyUser = req.session.user && req.session.user.SSN ? true : false;
    res.render('helpCenter', { user, isCompanyUser });
});
app.get('/chatSupport', async (req, res) => {
    const user = req.session.user ? await User.findById(req.session.user.id).exec() : null;
    const isCompanyUser = req.session.user && req.session.user.SSN ? true : false;
    res.render('chatSupport', { user, isCompanyUser });
});


app.get('/chatWithUs', async (req, res) => {
    const user = req.session.user ? await User.findById(req.session.user.id).exec() : null;
    const isCompanyUser = req.session.user && req.session.user.SSN ? true : false;
    res.render('chatWithUs', { user, isCompanyUser });
});


app.get("/businessCard", (req, res) => {
    res.render("businessCard");
});



app.get('/ourServices', function (req, res) {
    res.render('ourServices');
});

app.get('/cartText', (req, res) => {
    console.log('Session Cart:', req.session.cart); // Log the session cart
    const cart = req.session.cart || [];
    const totalAmount = cart.reduce((total, item) => total + item.product.Price * item.quantity, 0);
    res.render('cartText', { cart, totalAmount });
});

app.get("/login", (req, res) => {
    res.render("login");
});

app.get("/purchase", (req, res) => {
    if (req.session && req.session.user) {
        const cart = req.session.cart || [];
        const totalAmount = cart.reduce((total, item) => total + item.product.Price * item.quantity, 0);

        const user = req.session.user;
        if (user.cards && user.cards.length > 0) {
            user.cards = user.cards.map(card => {
                return {
                    ...card,
                    maskedCardNumber: maskCardNumber(card.cardNumber)
                };
            });
        }

        res.render("purchase", { user, cart, totalAmount });
    } else {
        res.redirect('/login');
    }
});


app.get("/signup", (req, res) => {
    res.render("signup");
});

app.get("/companyLogin", (req, res) => {
    res.render("companyLogin");
});

app.get("/companySignup", (req, res) => {
    res.render("companySignup");
});


app.get("/addProduct", (req, res) => {
    if (req.session.user) {
        res.render("addProduct", { user: req.session.user });
    } else {
        res.redirect('/companyHomePage');
    }
});

app.get('/addAddress', (req, res) => {
    res.render('addAddress');
});

app.get("/policy", (req, res) => {
    res.render("policy");
});

app.get('/settings', async (req, res) => {
    const user = req.session.user ? await User.findById(req.session.user.id).exec() : null;
    const isCompanyUser = req.session.user && req.session.user.SSN ? true : false;
    res.render('settings', { user, isCompanyUser });
});


app.get("/addMoney", (req, res) => {
    res.render("addMoney");
});

app.get("/addCredit", (req, res) => {
    res.render("addCredit");
});

app.get("/companyProfile", (req, res) => {
    if (req.session.user) {
        req.session.user.addresses = req.session.user.addresses || [];
        res.render("companyProfile", { user: req.session.user });
    } else {
        res.redirect('/companyLogin');
    }
});

// Define the companyHomePage route
app.get('/companyHomePage', async (req, res) => {
    const searchTerm = req.query.search || '';
    console.log('Search Term:', searchTerm); // Log the search term
    try {
        let products;
        if (searchTerm) {
            products = await Products.find({
                ProductName: { $regex: searchTerm, $options: 'i' }
            });
        } else {
            products = await Products.find();
        }
        const user = req.session.user ? await User.findById(req.session.user.id).populate('favorites').exec() : null;
        const isCompanyUser = req.session.user && req.session.user.SSN ? true : false;
        res.render('companyHomePage', { user, products, searchTerm, isCompanyUser });
    } catch (error) {
        console.error("Error fetching products:", error);
        res.status(500).send("An error occurred while fetching products.");
    }
});


app.get("/productInformation", (req, res) => {
    res.render("productInformation");
});

app.get("/cart", (req, res) => {
    console.log('Session Cart:', req.session.cart); // Log the session cart
    const cart = req.session.cart || [];
    const totalAmount = cart.reduce((total, item) => total + item.product.Price * item.quantity, 0);
    res.render('cart', { cart, totalAmount });
});

app.get("/forgotPassword", (req, res) => {
    res.render("forgotPassword");
});

// Register User



app.post("/signup", async (req, res) => {
    const data = {
        name: req.body.username,
        email: req.body.email,
        password: req.body.password
    };

    try {
        const existingUser = await User.findOne({ name: data.name });
        const existingEmail = await User.findOne({ email: data.email });

        if (existingUser) {
            return res.send('User already exists. Please choose a different username.');
        }

        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(data.password, saltRounds);
        data.password = hashedPassword;

        const userdata = await User.insertMany([data]);
        console.log(userdata);
        res.redirect("/");

    } catch (error) {
        console.error("Signup error:", error);
        res.status(500).send("An error occurred during signup.");
    }
});

// Login user
app.post('/login', async (req, res) => {
    console.log(req.sessionID);
    try {
        const check = await User.findOne({ name: req.body.username });
        if (!check) {
            return res.status(404).json({ success: false, message: 'Wrong Credentials Please try again ' });
        }

        const isPasswordMatch = await bcrypt.compare(req.body.password, check.password);
        if (!isPasswordMatch) {
            return res.status(401).json({ success: false, message: 'Wrong Credentials Please try again! ' });
        }

        req.session.user = {
            id: check._id,
            name: check.name,
            email: check.email,
            phoneNumber: check.phoneNumber,
            surname: check.surname,
            gender: check.gender,
            addresses: check.addresses,
            cards: check.cards
        };

        res.json({ success: true, message: 'Login successful' });
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ success: false, message: 'An error occurred during login.' });
    }
});


// Company Signup
app.post("/companySignup", async (req, res) => {
    const data = {
        name: req.body.username,
        email: req.body.email,
        SSN: req.body.SSN,
        password: req.body.password
    };

    try {
        const existingUser = await CompanyUser.findOne({ name: data.name });
        const existingEmail = await CompanyUser.findOne({ email: data.email });
        const existingSSN = await CompanyUser.findOne({ SSN: data.SSN });

        if (existingUser) {
            return res.send('User already exists. Please choose a different username.');
        }

        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(data.password, saltRounds);
        data.password = hashedPassword;

        const hashedSSN = await bcrypt.hash(data.SSN, saltRounds);
        data.SSN = hashedSSN;

        const userdata = await CompanyUser.insertMany([data]);
        console.log(userdata);
        res.redirect("/companyLogin");

    } catch (error) {
        console.error("Signup error:", error);
        res.status(500).send("An error occurred during signup.");
    }
});

// Company Login
app.post('/companyLogin', async (req, res) => {
    try {
        const check = await CompanyUser.findOne({ name: req.body.username });
        if (!check) {
            return res.status(404).json({ success: false, message: 'User name not found' });
        }

        const isPasswordMatch = await bcrypt.compare(req.body.password, check.password);
        if (!isPasswordMatch) {
            return res.status(401).json({ success: false, message: 'Wrong password' });
        }

        req.session.user = {
            id: check._id,
            name: check.name,
            email: check.email,
            SSN: check.SSN,
            phoneNumber: check.phoneNumber,
            surname: check.surname,
            gender: check.gender,
            addresses: check.addresses,
            cards: check.cards
        };

        res.json({ success: true, message: 'Login successful' });
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ success: false, message: 'An error occurred during login.' });
    }
});


// Route to update user information
app.post("/updateUser", async (req, res) => {
    const userId = req.session.user.id;
    const updatedData = {};

    if (req.body.name) updatedData.name = req.body.name;
    if (req.body.surname) updatedData.surname = req.body.surname;
    if (req.body.email) updatedData.email = req.body.email;
    if (req.body.phoneNumber) updatedData.phoneNumber = req.body.phoneNumber;
    if (req.body.gender) updatedData.gender = req.body.gender;

    try {
        const updatedUser = await User.findByIdAndUpdate(userId, updatedData, { new: true });
        req.session.user = { ...req.session.user, ...updatedData };
        req.session.save((err) => {
            if (err) {
                console.error("Session save error:", err);
            }
            res.redirect("/userProfile");
        });
    } catch (error) {
        console.error("Update user error:", error);
        res.status(500).send("An error occurred during the update.");
    }
});

app.post("/updateCompanyUser", async (req, res) => {
    const userId = req.session.user.id;
    const updatedData = {};

    if (req.body.name) updatedData.name = req.body.name;
    if (req.body.surname) updatedData.surname = req.body.surname;
    if (req.body.email) updatedData.email = req.body.email;
    if (req.body.phoneNumber) updatedData.phoneNumber = req.body.phoneNumber;
    if (req.body.gender) updatedData.gender = req.body.gender;
    if (req.body.SSN) updatedData.SSN = req.body.SSN;

    try {
        const updatedUser = await CompanyUser.findByIdAndUpdate(userId, updatedData, { new: true });
        req.session.user = { ...req.session.user, ...updatedData };
        req.session.save((err) => {
            if (err) {
                console.error("Session save error:", err);
            }
            res.redirect("/companyProfile");
        });
    } catch (error) {
        console.error("Update company user error:", error);
        res.status(500).send("An error occurred during the update.");
    }
});

// POST route to add a new product
app.post('/addProduct', (req, res) => {
    upload(req, res, async (err) => {
        if (err) {
            console.error("File upload error:", err);
            return res.status(400).send(err);
        }

        const { productName, price, barcode, quantity, description, category } = req.body;
        const imageFile = req.file;

        // Get the companyName from the session
        if (!req.session.user || !req.session.user.SSN) {
            return res.status(401).send("Unauthorized: Only company users can add products");
        }

        const companyName = req.session.user.name;

        const newProduct = new Products({
            ProductName: productName,
            Price: price,
            BarCode: barcode,
            Quantity: quantity,
            Description: description,
            Category: category,
            Image: imageFile ? { data: imageFile.buffer, contentType: imageFile.mimetype } : null,
            companyName: companyName // Add companyName to the new product
        });

        try {
            await newProduct.save();
            res.redirect('/companyHomePage');
        } catch (error) {
            console.error("Error adding product:", error);
            res.status(500).send("An error occurred while adding the product.");
        }
    });
});



app.post('/addAddress', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/');
    }

    const userId = req.session.user.id;
    const newAddress = {
        addressName: req.body.addressName,
        street: req.body.street,
        streetNumber: req.body.streetNumber,
        postalCode: req.body.postalCode,
        city: req.body.city,
        floor: req.body.floor,
        phonenumber: req.body.phonenumber
    };

    try {
        const user = await User.findById(userId);

        if (user.addresses.length >= 3) {
            return res.send("You can only add up to 3 addresses.");
        }

        user.addresses.push(newAddress);
        await user.save();
        req.session.user.addresses = user.addresses;
        res.redirect('/userProfile');
    } catch (error) {
        console.error("Error adding address:", error);
        res.status(500).send("An error occurred while adding the address.");
    }
});

app.post('/addCredit', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/');
    }

    const userId = req.session.user.id;
    const newCard = {
        cardNumber: req.body.cardNumber,
        cardName: req.body.cardHolderName,
        expiryDate: req.body.expirationDate,
        cvv: req.body.cvv
    };

    try {
        const user = await User.findById(userId);
        if (user.cards.length >= 3) {
            return res.json({ success: false, message: "You can only add up to 3 cards." });
        }

        user.cards.push(newCard);
        await user.save();
        req.session.user.cards = user.cards;
        res.redirect('/userWallet');
    } catch (error) {
        console.error("Error adding card:", error);
    }
});

app.get('/addCompanyAddress', (req, res) => {
    if (req.session.user) {
        res.render('addCompanyAddress');
    } else {
        res.redirect('/companyLogin');
    }
});

app.post('/addCompanyAddress', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/companyLogin');
    }

    const userId = req.session.user.id;
    const newAddress = {
        addressName: req.body.addressName,
        street: req.body.street,
        streetNumber: req.body.streetNumber,
        postalCode: req.body.postalCode,
        city: req.body.city,
        floor: req.body.floor,
        phonenumber: req.body.phonenumber
    };

    try {
        const companyUser = await CompanyUser.findById(userId);
        if (companyUser.addresses.length >= 3) {
            return res.send("You can only add up to 3 addresses.");
        }

        companyUser.addresses.push(newAddress);
        await companyUser.save();
        req.session.user.addresses = companyUser.addresses;
        res.redirect('/companyProfile');
    } catch (error) {
        console.error("Error adding address:", error);
        res.status(500).send("An error occurred while adding the address.");
    }
});

// Endpoint to delete user account
// Endpoint to delete user or company user account
app.post('/deleteAccount', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, message: 'User not logged in' });
    }

    const userId = req.session.user.id;
    const isCompanyUser = req.session.user.SSN ? true : false;

    try {
        if (isCompanyUser) {
            await CompanyUser.findByIdAndDelete(userId);
        } else {
            await User.findByIdAndDelete(userId);
        }

        req.session.destroy(err => {
            if (err) {
                console.error("Error deleting account:", err);
                return res.status(500).json({ success: false, message: 'An error occurred during account deletion.' });
            }
            res.json({ success: true, message: 'Account deleted successfully' });
        });
    } catch (error) {
        console.error("Error deleting account:", error);
        res.status(500).json({ success: false, message: 'An error occurred while deleting the account.' });
    }
});


// Define Port for Application
const port = 3000;
app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
