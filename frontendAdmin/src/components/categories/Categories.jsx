"use client"

import { useEffect, useState } from "react"
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core"
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { fetchAuthSession } from "aws-amplify/auth"
import SortableRow from "./SortableRow"
import LoadingScreen from "../Loading/LoadingScreen"
import { toast } from "react-toastify"
import "react-toastify/dist/ReactToastify.css"

const Categories = ({ setSelectedPage, setNextCategoryNumber, setSelectedCategory }) => {
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {}, [categories])

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const session = await fetchAuthSession()
        var token = session.tokens.idToken
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_ENDPOINT}admin/categories`, {
          method: "GET",
          headers: {
            Authorization: token,
            "Content-Type": "application/json",
          },
        })
        if (response.ok) {
          const data = await response.json()
          console.log("categories", data)
          updateCategoryNumbers(data)
          setNextCategoryNumber(data.length + 1)
        } else {
          console.error("Failed to fetch categories:", response.statusText)
        }
      } catch (error) {
        console.error("Error fetching categories:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchCategories()
  }, [setNextCategoryNumber])

  const updateCategoryNumbers = (categories) => {
    const sortedCategories = [...categories].sort((a, b) => a.category_number - b.category_number)
    const updatedCategories = sortedCategories.map((category, index) => ({
      ...category,
      category_number: index + 1, // Set category_number to ascending values starting from 1
    }))
    setCategories(updatedCategories)
  }

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const handleDragEnd = (event) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      setCategories((items) => {
        const oldIndex = items.findIndex((item) => item.category_number === active.id)
        const newIndex = items.findIndex((item) => item.category_number === over.id)

        return arrayMove(items, oldIndex, newIndex)
      })
    }
  }

  const saveOrder = async () => {
    const session = await fetchAuthSession()
    const token = session.tokens.idToken
    for (let i = 0; i < categories.length; i++) {
      const category = categories[i]

      try {
        const response = await await fetch(
          `${process.env.NEXT_PUBLIC_API_ENDPOINT}admin/edit_category?category_id=${encodeURIComponent(
            category.category_id,
          )}&category_name=${encodeURIComponent(category.category_name)}&category_number=${encodeURIComponent(i + 1)}`,
          {
            method: "PUT",
            headers: {
              Authorization: token,
              "Content-Type": "application/json",
            },
          },
        )

        if (!response.ok) {
          toast.error("Failed to save order", {
            position: "top-center",
            autoClose: 3000,
            hideProgressBar: false,
            closeOnClick: true,
            pauseOnHover: true,
            draggable: true,
            progress: undefined,
            theme: "colored",
          })
          throw new Error(`Failed to update category: ${category.category_name}`)
        }
      } catch (error) {
        console.error("Error saving order:", error)
        return
      }
    }
    toast.success("Order successfully saved", {
      position: "top-center",
      autoClose: 3000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
      progress: undefined,
      theme: "colored",
    })
  }

  if (loading) {
    return <LoadingScreen />
  }

  return (
    <div className="px-4 sm:px-8 md:px-16 w-full md:w-11/12 lg:w-9/12 max-w-6xl space-y-6 overflow-hidden">
      <div className="mt-8 rounded-md border">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <div className="max-h-[60vh] overflow-y-auto overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16 sm:w-auto">Move</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="w-16 sm:w-auto">Edit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <SortableContext
                  items={categories.map((category) => category.category_number)}
                  strategy={verticalListSortingStrategy}
                >
                  {categories.map((category) => (
                    <SortableRow
                      key={category.category_number}
                      category={category}
                      setSelectedCategory={setSelectedCategory}
                      setSelectedPage={setSelectedPage}
                    />
                  ))}
                </SortableContext>
              </TableBody>
            </Table>
          </div>
        </DndContext>
      </div>
      <div className="flex flex-col sm:flex-row gap-4 sm:justify-between">
        <Button
          onClick={() => setSelectedPage("category_creation")}
          className="bg-adminMain hover:bg-adminHover text-white font-semibold py-3 sm:py-4 w-full sm:w-auto"
        >
          Create New Category
        </Button>
        <Button
          onClick={() => saveOrder()}
          className="bg-adminMain hover:bg-adminHover text-white font-semibold py-3 sm:py-4 w-full sm:w-auto"
        >
          Save Order
        </Button>
      </div>
    </div>
  )
}

export default Categories

