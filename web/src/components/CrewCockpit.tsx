import { useEffect, useRef, useState } from 'react'
import {
  AmbientLight,
  Box3,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  DirectionalLight,
  Group,
  Material,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Points,
  PointsMaterial,
  Raycaster,
  RingGeometry,
  Scene,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js'
import type { HealthStatus } from '../domain/types'
import './CrewCockpit.css'

export interface CockpitCrewMember {
  id: string
  name: string
  code: string
  role: string
  status: HealthStatus
}

interface CrewCockpitProps {
  crew: CockpitCrewMember[]
  selectedId: string
  onSelect: (id: string) => void
}

// Theme tokens from cosmos-shell.css (three.js cannot read CSS variables).
const palette = {
  bg: '#0f1013',
  wall: '#17171b',
  deck: '#1b1a1f',
  brass: '#d2ae74',
  copper: '#bd7b52',
  marble: '#f0eadf',
}

const statusColor: Record<HealthStatus, string> = {
  green: '#34d399',
  amber: '#fbbf24',
  red: '#f87171',
  missing: '#847e75',
}

const statusLabel: Record<HealthStatus, string> = {
  green: 'Stabil',
  amber: 'Dikkat',
  red: 'Kritik',
  missing: 'Veri yok',
}

const SLOT_X = [-2.5, 0, 2.5]
const ASTRONAUT_HEIGHT = 3
const CAMERA_Z = 9.2

interface Slot {
  id: string
  group: Group
  ring: Mesh
  screen: Mesh
  light: PointLight
  baseY: number
}

function disposeTree(root: Object3D) {
  const materials = new Set<Material>()
  root.traverse((object) => {
    if (!(object instanceof Mesh) && !(object instanceof Points)) return
    object.geometry.dispose()
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material)
    }
  })
  for (const material of materials) {
    for (const value of Object.values(material)) {
      if (value && typeof value === 'object' && 'isTexture' in value) (value as { dispose: () => void }).dispose()
    }
    material.dispose()
  }
}

function roundedRect(shape: Shape | import('three').Path, width: number, height: number, radius: number) {
  const x = -width / 2
  const y = -height / 2
  shape.moveTo(x + radius, y)
  shape.lineTo(x + width - radius, y)
  shape.quadraticCurveTo(x + width, y, x + width, y + radius)
  shape.lineTo(x + width, y + height - radius)
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  shape.lineTo(x + radius, y + height)
  shape.quadraticCurveTo(x, y + height, x, y + height - radius)
  shape.lineTo(x, y + radius)
  shape.quadraticCurveTo(x, y, x + radius, y)
}

function buildCabin(scene: Scene) {
  const cabin = new Group()

  // Back wall with a rounded observation window cut out of it.
  const WIN_W = 11
  const WIN_H = 3.7
  const wall = new Shape()
  wall.moveTo(-14, -4)
  wall.lineTo(14, -4)
  wall.lineTo(14, 9)
  wall.lineTo(-14, 9)
  wall.closePath()
  const hole = new Shape()
  roundedRect(hole, WIN_W, WIN_H, 0.7)
  wall.holes.push(hole)
  const wallMesh = new Mesh(new ShapeGeometry(wall), new MeshStandardMaterial({ color: palette.wall, roughness: 0.9 }))
  wallMesh.position.set(0, 2.6, -3.2)
  cabin.add(wallMesh)

  // Brass frame ring around the window.
  const frame = new Shape()
  roundedRect(frame, WIN_W + 0.36, WIN_H + 0.36, 0.85)
  const frameHole = new Shape()
  roundedRect(frameHole, WIN_W, WIN_H, 0.7)
  frame.holes.push(frameHole)
  const frameMesh = new Mesh(
    new ShapeGeometry(frame),
    new MeshStandardMaterial({ color: palette.brass, metalness: 0.7, roughness: 0.4 }),
  )
  frameMesh.position.set(0, 2.6, -3.18)
  cabin.add(frameMesh)

  // Stars and a distant copper planet seen through the window.
  const starCount = 520
  const positions = new Float32Array(starCount * 3)
  for (let i = 0; i < starCount; i += 1) {
    positions[i * 3] = MathUtils.randFloatSpread(30)
    positions[i * 3 + 1] = MathUtils.randFloat(-1, 8)
    positions[i * 3 + 2] = MathUtils.randFloat(-14, -6)
  }
  const starGeometry = new BufferGeometry()
  starGeometry.setAttribute('position', new BufferAttribute(positions, 3))
  cabin.add(new Points(starGeometry, new PointsMaterial({ color: palette.marble, size: 0.05, sizeAttenuation: true })))

  const planet = new Mesh(
    new SphereGeometry(2.1, 40, 28),
    new MeshStandardMaterial({ color: palette.copper, roughness: 0.95, emissive: '#3a1f12', emissiveIntensity: 0.6 }),
  )
  planet.position.set(3.4, 2.9, -8)
  cabin.add(planet)

  // Deck and console: a long desk the astronauts stand behind.
  const deck = new Mesh(new PlaneGeometry(30, 14), new MeshStandardMaterial({ color: palette.deck, roughness: 0.85 }))
  deck.rotation.x = -Math.PI / 2
  deck.position.set(0, 0, 0)
  cabin.add(deck)

  const consoleBody = new Mesh(new BoxGeometry(9.6, 0.78, 0.95), new MeshStandardMaterial({ color: '#2a292f', roughness: 0.55, metalness: 0.15 }))
  consoleBody.position.set(0, 0.39, 1.7)
  cabin.add(consoleBody)
  const trim = new Mesh(new BoxGeometry(9.64, 0.07, 0.07), new MeshStandardMaterial({ color: palette.brass, metalness: 0.7, roughness: 0.35 }))
  trim.position.set(0, 0.78, 2.18)
  cabin.add(trim)

  scene.add(cabin)
  return cabin
}

export function CrewCockpit({ crew, selectedId, onSelect }: CrewCockpitProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const labelRefs = useRef(new Map<string, HTMLButtonElement>())
  const slotsRef = useRef(new Map<string, Slot>())
  const selectedRef = useRef(selectedId)
  const crewRef = useRef(crew)
  const onSelectRef = useRef(onSelect)
  const [unavailable, setUnavailable] = useState(false)
  const crewKey = crew.map(({ id }) => id).join('|')

  useEffect(() => {
    selectedRef.current = selectedId
    crewRef.current = crew
    onSelectRef.current = onSelect
  })

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const members = crewRef.current.slice(0, SLOT_X.length)

    let renderer: WebGLRenderer
    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: true })
    } catch (error) {
      console.error('The crew cockpit could not start WebGL.', error)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUnavailable(true)
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    host.appendChild(renderer.domElement)

    const scene = new Scene()
    scene.background = new Color(palette.bg)
    const camera = new PerspectiveCamera(30, 2.4, 0.1, 60)
    camera.position.set(0, 2.5, CAMERA_Z)
    camera.lookAt(0, 1.45, 0)

    scene.add(new AmbientLight('#b5aea2', 0.9))
    const key = new DirectionalLight('#fff4e0', 2.1)
    key.position.set(2, 6, 7)
    scene.add(key)
    const warm = new PointLight(palette.brass, 14, 14, 1.6)
    warm.position.set(0, 3.2, 2)
    scene.add(warm)

    buildCabin(scene)

    const slots = slotsRef.current
    slots.clear()
    const fleet = new Group()
    scene.add(fleet)
    const raycaster = new Raycaster()
    const pointer = new Vector2()
    const pickable: Object3D[] = []
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    members.forEach((member, index) => {
      const x = SLOT_X[index]
      const group = new Group()
      group.position.set(x, 0, 0)
      group.rotation.y = -x * 0.07
      fleet.add(group)

      const ring = new Mesh(
        new RingGeometry(0.95, 1.05, 48),
        new MeshBasicMaterial({ color: palette.brass, transparent: true, opacity: 0.35 }),
      )
      ring.rotation.x = -Math.PI / 2
      ring.position.set(x, 0.02, 0)
      scene.add(ring)

      const pad = new Mesh(new CircleGeometry(0.95, 48), new MeshStandardMaterial({ color: '#26252b', roughness: 0.7 }))
      pad.rotation.x = -Math.PI / 2
      pad.position.set(x, 0.01, 0)
      scene.add(pad)

      const screen = new Mesh(
        new PlaneGeometry(0.8, 0.28),
        new MeshBasicMaterial({ color: statusColor[member.status] }),
      )
      screen.rotation.x = -Math.PI / 2 + 0.35
      screen.position.set(x, 0.83, 1.75)
      scene.add(screen)

      const light = new PointLight(statusColor[member.status], 3, 3.4, 1.6)
      light.position.set(x, 1.15, 1.6)
      scene.add(light)

      slots.set(member.id, { id: member.id, group, ring, screen, light, baseY: 0 })
    })

    let disposed = false
    new GLTFLoader().load(
      '/models/astronaut.glb',
      (gltf) => {
        if (disposed) {
          disposeTree(gltf.scene)
          return
        }
        const bounds = new Box3().setFromObject(gltf.scene)
        const size = bounds.getSize(new Vector3())
        const center = bounds.getCenter(new Vector3())
        if (size.y <= 0) {
          setUnavailable(true)
          return
        }
        const scale = ASTRONAUT_HEIGHT / size.y
        members.forEach((member) => {
          const slot = slots.get(member.id)
          if (!slot) return
          const body = cloneSkinned(gltf.scene)
          body.scale.setScalar(scale)
          body.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale)
          body.traverse((object) => {
            if (!(object instanceof Mesh)) return
            object.userData.crewId = member.id
            pickable.push(object)
          })
          slot.group.add(body)
        })
      },
      undefined,
      (error) => {
        if (disposed) return
        console.error('The cockpit astronaut model could not be loaded.', error)
        setUnavailable(true)
      },
    )

    const pickAt = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObjects(pickable, false)[0]
      return hit ? (hit.object.userData.crewId as string) : null
    }
    const handleMove = (event: PointerEvent) => {
      renderer.domElement.style.cursor = pickAt(event) ? 'pointer' : 'default'
    }
    const handleClick = (event: PointerEvent) => {
      const id = pickAt(event)
      if (id) onSelectRef.current(id)
    }
    renderer.domElement.addEventListener('pointermove', handleMove)
    renderer.domElement.addEventListener('click', handleClick as unknown as EventListener)

    const resize = () => {
      const width = host.clientWidth
      const height = host.clientHeight
      if (!width || !height) return
      camera.aspect = width / height
      // Keep the whole row of three in frame on narrow screens.
      camera.fov = camera.aspect < 1.9 ? MathUtils.clamp(30 * (1.9 / camera.aspect), 30, 52) : 30
      camera.updateProjectionMatrix()
      renderer.setSize(width, height, false)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    resize()

    const projected = new Vector3()
    let frame = 0
    const render = (now: number) => {
      frame = window.requestAnimationFrame(render)
      const width = host.clientWidth
      const height = host.clientHeight
      for (const member of crewRef.current) {
        const slot = slots.get(member.id)
        if (!slot) continue
        const selected = member.id === selectedRef.current
        const color = statusColor[member.status]
        ;(slot.screen.material as MeshBasicMaterial).color.set(color)
        slot.light.color.set(color)
        slot.light.intensity = MathUtils.lerp(slot.light.intensity, selected ? 6 : 2, 0.1)
        const ringMaterial = slot.ring.material as MeshBasicMaterial
        ringMaterial.color.set(selected ? palette.brass : palette.marble)
        ringMaterial.opacity = MathUtils.lerp(ringMaterial.opacity, selected ? 0.95 : 0.22, 0.12)
        const lift = selected ? 0.06 + (reduceMotion ? 0 : Math.sin(now * 0.0017) * 0.025) : 0
        slot.group.position.y = MathUtils.lerp(slot.group.position.y, lift, 0.12)

        const label = labelRefs.current.get(member.id)
        if (label && width > 0 && height > 0) {
          projected.set(slot.group.position.x, 0, 2.3).project(camera)
          label.style.left = `${((projected.x + 1) / 2) * width}px`
        }
      }
      renderer.render(scene, camera)
    }
    frame = window.requestAnimationFrame(render)

    return () => {
      disposed = true
      window.cancelAnimationFrame(frame)
      observer.disconnect()
      renderer.domElement.removeEventListener('pointermove', handleMove)
      renderer.domElement.removeEventListener('click', handleClick as unknown as EventListener)
      slots.clear()
      disposeTree(scene)
      renderer.dispose()
      renderer.domElement.remove()
    }
    // The scene is built once per crew roster; live status changes are read through refs.
  }, [crewKey])

  return (
    <div className="crew-cockpit" data-testid="crew-cockpit">
      <div className="crew-cockpit-canvas" ref={hostRef} />
      <div className={`crew-cockpit-labels ${unavailable ? 'is-fallback' : ''}`} role="radiogroup" aria-label="Astronot seç">
        {crew.map((member) => (
          <button
            aria-checked={member.id === selectedId}
            className={`cockpit-label status-${member.status} ${member.id === selectedId ? 'is-selected' : ''}`}
            data-testid={`cockpit-astronaut-${member.id}`}
            key={member.id}
            onClick={() => onSelect(member.id)}
            ref={(element) => {
              if (element) labelRefs.current.set(member.id, element)
              else labelRefs.current.delete(member.id)
            }}
            role="radio"
            type="button"
          >
            <span className="cockpit-label-code">{member.code}</span>
            <strong>{member.name}</strong>
            <span className="cockpit-label-status">
              <i /> {statusLabel[member.status]}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
