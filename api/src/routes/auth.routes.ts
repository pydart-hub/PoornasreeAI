import { Router } from "express"
import { registerUser, loginUser, getMe, logoutUser, setPassword, updateProfile } from "../controllers/auth.controller"
import { protect } from "../middleware/auth"

const router = Router()

router.post("/register", registerUser)
router.post("/login", loginUser)
router.get("/me", getMe)
router.post("/logout", logoutUser)
router.post("/set-password", setPassword)
router.patch("/profile", protect, updateProfile)

export default router