import { Router } from "express"
import { registerUser, loginUser, getMe, logoutUser } from "../controllers/auth.controller"

const router = Router()

router.post("/register", registerUser)
router.post("/login", loginUser)
router.get("/me", getMe)
router.post("/logout", logoutUser)

export default router