import { NextResponse } from "next/server";

export async function GET() {
  const target =
    process.env.GOOGLE_REVIEW_URL ||
    "https://www.google.com/search?q=poornasree+equipments+rating&sca_esv=424538866ee42d06&rlz=1C5GCEM_enIN1204IN1205&sxsrf=APpeQnvdjhKVkQ-FN3y0AZyfP0Qq-1fijA%3A1788940867831&ei=QxKharX_MZCchvcPpZLj0QE&biw=1470&bih=835&ved=2ahUKEwj1rM2HhOGWAxUQjuEIHSXJOBoQ4dUDegQIBhAM&uact=5&oq=poornasree+equipments+rating&gs_lp=Egxnd3Mtd2l6LXNlcnAiHHBvb3JuYXNyZWUgZXF1aXBtZW50cyByYXRpbmcyBhAAGBYYHjILEAAYgAQYigUYhgNIpCFQpANYqB5wAHgCkAEAmAG8AaABwAaqAQMzLjS4AQPIAQD4AQGYAgagApcFwgIEEAAYR8ICBRAAGIAEwgILEC4YrwEYxwEYgATCAgIQJsICBBAhGBWYAwCIBgGQBgiSBwMyLjSgB4sQsgcDMS40uAeWBcIHAzEuNcgHCIAIAQ&sclient=gws-wiz-serp#lrd=0x3b087304d11a5893:0xbd3ca8c2644804ef,3,,,,";

  return NextResponse.redirect(target, { status: 307 });
}
