import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      position="top-right"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast bg-gray-900/95 border-2 border-amber-500/40 text-gray-100 font-jrpg shadow-lg shadow-amber-500/10",
          description: "text-gray-400 font-jrpg text-xs",
          actionButton: "bg-amber-600 text-white font-jrpg",
          cancelButton: "bg-gray-700 text-gray-300 font-jrpg",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
