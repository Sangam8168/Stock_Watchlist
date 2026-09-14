import Header from "@/components/Header";
import Disclaimer from "@/components/Disclaimer";
import TickerTape from "@/components/TickerTape";
import {auth} from "@/lib/better-auth/auth";
import {headers} from "next/headers";
import {redirect} from "next/navigation";

const Layout = async ({ children }: { children : React.ReactNode }) => {
    const session = await auth.api.getSession({ headers: await headers() });

    if(!session?.user) redirect('/sign-in');

    const user = {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
    }

    return (
        <main className="min-h-screen text-gray-400">
            <Header user={user} />
            <TickerTape />

            <div className="container py-10">
                {children}
            </div>

            <footer className="container pb-10">
                <Disclaimer />
            </footer>
        </main>
    )
}
export default Layout
